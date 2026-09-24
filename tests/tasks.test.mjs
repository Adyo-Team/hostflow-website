import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
let db, alpha, beta, property, other, foreign;
const users = Object.fromEntries(
  ["a", "b", "manager", "staff", "admin", "property_owner", "guest"].map(
    (n) => [n, randomUUID()],
  ),
);
const one = async (q, args = []) => (await db.query(q, args)).rows[0];
async function as(who, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    who ? users[who] : "",
  ]);
  await db.exec(who ? "set role authenticated" : "set role anon");
  return fn();
}
async function propertyFor(org) {
  const id = randomUUID();
  await db.query(
    "insert into public.properties(id,organization_id,name,address_line1,city,country,property_type,capacity,bedrooms,beds,bathrooms) values($1,$2,'QA property','1 Test','Test','BE','house',4,1,2,1)",
    [id, org],
  );
  return id;
}
const reserve = (
  start = "2030-09-10",
  end = "2030-09-15",
  p = property,
  org = alpha,
) =>
  one(
    "insert into public.reservations(organization_id,property_id,check_in,check_out,guest_name) values($1,$2,$3,$4,'QA traveller') returning *",
    [org, p, start, end],
  );
const block = (
  start = "2031-09-10",
  end = "2031-09-15",
  p = property,
  org = alpha,
) =>
  one(
    "insert into public.property_blocks(organization_id,property_id,start_date,end_date,reason) values($1,$2,$3,$4,'works') returning *",
    [org, p, start, end],
  );
before(async () => {
  db = new PGlite({ extensions: { pgcrypto, btree_gist } });
  await db.waitReady;
  await db.exec(
    "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort())
    await db.exec(await readFile(new URL(f, dir), "utf8"));
  for (const [name, id] of Object.entries(users))
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)",
      [
        id,
        name + "@example.test",
        JSON.stringify({ first_name: name, last_name: "QA" }),
      ],
    );
  alpha = (
    await as("a", () =>
      one(
        "select public.create_organization('Alpha','alpha','Europe/Brussels','EUR','BE') id",
      ),
    )
  ).id;
  beta = (
    await as("b", () =>
      one(
        "select public.create_organization('Beta','beta','Europe/Brussels','EUR','BE') id",
      ),
    )
  ).id;
  await db.exec("reset role");
  for (const name of ["manager", "staff", "admin", "property_owner", "guest"])
    await db.query(
      "insert into public.organization_members(organization_id,user_id,display_name,role,created_by) values($1,$2,$3::text,$3::text::public.organization_role,$4)",
      [alpha, users[name], name, users.a],
    );
  property = await as("a", () => propertyFor(alpha));
  other = await as("a", () => propertyFor(alpha));
  foreign = await as("b", () => propertyFor(beta));
});
after(async () => await db?.close());

const task = (patch = {}) =>
  one(
    "insert into public.tasks(organization_id,property_id,reservation_id,assignee_id,type,title,scheduled_at) values($1,$2,$3,$4,'cleaning','QA cleaning','2030-09-15T12:00:00Z') returning *",
    [
      patch.org || alpha,
      patch.property || property,
      patch.reservation || null,
      patch.assignee || null,
    ],
  );
let assigned, unassigned;
test("tasks create edit assign status and metadata", () =>
  as("a", async () => {
    assigned = await task({ assignee: users.staff });
    unassigned = await task();
    assert.equal(assigned.created_by, users.a);
    assert.equal(assigned.version, 1);
    const r = await one(
      "update public.tasks set title='Updated',priority='urgent' where id=$1 returning *",
      [assigned.id],
    );
    assert.equal(r.version, 2);
    const stale = await db.query(
      "update public.tasks set status='done' where id=$1 and version=1 returning id",
      [assigned.id],
    );
    assert.equal(stale.rows.length, 0);
  }));
test("staff can read only own tasks and update only status directly", () =>
  as("staff", async () => {
    assert.equal((await db.query("select * from public.tasks")).rows.length, 1);
    await db.query("update public.tasks set status='in_progress' where id=$1", [
      assigned.id,
    ]);
    for (const change of [
      "title='Hacked'",
      "priority='low'",
      "assignee_id=null",
      "status='cancelled'",
      "organization_id='" + beta + "'",
    ]) {
      await assert.rejects(
        db.query("update public.tasks set " + change + " where id=$1", [
          assigned.id,
        ]),
        (e) => e.code === "42501",
      );
    }
    assert.equal(
      (
        await db.query(
          "update public.tasks set status='done' where id=$1 returning id",
          [unassigned.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(task(), (e) => e.code === "42501");
    const names = await db.query(
      "select * from public.task_property_names($1)",
      [alpha],
    );
    assert.equal(names.rows.length, 1);
    assert.equal(names.rows[0].id, property);
    assert.equal(
      (await db.query("select * from public.task_property_names($1)", [beta]))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.properties")).rows.length,
      0,
    );
  }));
test("foreign tenant cannot read write delete or assign across organizations", async () => {
  await as("b", async () => {
    assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
    await assert.rejects(task(), (e) => e.code === "42501");
    assert.equal(
      (
        await db.query(
          "update public.tasks set title='No' where id=$1 returning id",
          [assigned.id],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("delete from public.tasks"),
      (e) => e.code === "42501",
    );
  });
  await as("a", async () => {
    await assert.rejects(
      task({ property: foreign }),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      task({ assignee: users.b }),
      (e) => e.code === "23514",
    );
  });
});
test("reservation must belong to the selected property and tenant", () =>
  as("a", async () => {
    const r = await reserve();
    await task({ reservation: r.id });
    await assert.rejects(
      task({ property: other, reservation: r.id }),
      (e) => e.code === "23503",
    );
    await db.query("update public.reservations set property_id=$1 where id=$2",[other,r.id]);
    assert.equal((await one("select property_id from public.tasks where reservation_id=$1",[r.id])).property_id,other);
  }));
test("manager and admin reuse existing management roles", async () => {
  for (const who of ["manager", "admin"])
    await as(who, async () => {
      const r = await task({ assignee: users.staff });
      await db.query("update public.tasks set status='cancelled' where id=$1", [
        r.id,
      ]);
    });
});
test("invalid types dates priority title and identity rejected", () =>
  as("a", async () => {
    for (const change of [
      "type='other'",
      "status='unknown'",
      "priority='none'",
      "title=' '",
      "scheduled_at='infinity'",
    ]) {
      await assert.rejects(
        db.query("update public.tasks set " + change + " where id=$1", [
          unassigned.id,
        ]),
        (e) => e.code === "23514",
      );
    }
    await assert.rejects(
      db.query("update public.tasks set created_by=$1 where id=$2", [
        users.b,
        unassigned.id,
      ]),
      (e) => e.code === "42501",
    );
  }));
test("suspended assignee cannot read or update; new assignments rejected", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [alpha, users.staff],
  );
  await as("staff", async () => {
    assert.equal((await db.query("select * from public.tasks")).rows.length, 0);
    assert.equal(
      (await db.query("update public.tasks set status='done' returning id"))
        .rows.length,
      0,
    );
    assert.equal(
      (await db.query("select * from public.task_property_names($1)", [alpha]))
        .rows.length,
      0,
    );
  });
  await as("a", async () => {
    await assert.rejects(
      task({ assignee: users.staff }),
      (e) => e.code === "23514",
    );
    await db.query("update public.tasks set status='done' where id=$1", [
      assigned.id,
    ]);
  });
});
test("future roles and anonymous remain denied", async () => {
  for (const who of ["guest", "property_owner"])
    await as(who, async () => {
      assert.equal(
        (await db.query("select * from public.tasks")).rows.length,
        0,
      );
      await assert.rejects(task(), (e) => e.code === "42501");
    });
  await as(null, () =>
    assert.rejects(
      db.exec("select * from public.tasks"),
      (e) => e.code === "42501",
    ),
  );
});
