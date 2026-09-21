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
test("reservation creates metadata and atomic private occupancy", () =>
  as("a", async () => {
    const r = await reserve();
    assert.equal(r.source, "manual");
    assert.equal(r.created_by, users.a);
    assert.equal(r.version, 1);
    assert.equal(r.status, "confirmed");
  }));
test("reservation overlap refused; adjacency and another property allowed", () =>
  as("a", async () => {
    await assert.rejects(
      reserve("2030-09-14", "2030-09-20"),
      (e) => e.code === "23P01",
    );
    await reserve("2030-09-15", "2030-09-20");
    await reserve("2030-09-10", "2030-09-15", other);
    await reserve("2030-09-05", "2030-09-10");
  }));
test("cancel releases occupancy; reactivation rechecks overlap", () =>
  as("a", async () => {
    const r = await reserve("2030-10-10", "2030-10-15");
    await db.query(
      "update public.reservations set status='cancelled' where id=$1",
      [r.id],
    );
    await reserve("2030-10-10", "2030-10-15");
    await assert.rejects(
      db.query(
        "update public.reservations set status='confirmed' where id=$1",
        [r.id],
      ),
      (e) => e.code === "23P01",
    );
  }));
test("date edit moves occupancy and rejects a conflicting change atomically", () =>
  as("a", async () => {
    const r = await reserve("2030-11-10", "2030-11-15");
    await db.query(
      "update public.reservations set check_in='2030-11-15',check_out='2030-11-20' where id=$1",
      [r.id],
    );
    await reserve("2030-11-10", "2030-11-15");
    await assert.rejects(
      db.query(
        "update public.reservations set check_in='2030-11-14' where id=$1",
        [r.id],
      ),
      (e) => e.code === "23P01",
    );
    assert.equal(
      (
        await one(
          "select check_in::text from public.reservations where id=$1",
          [r.id],
        )
      ).check_in,
      "2030-11-15",
    );
  }));
test("block/reservation, reservation/block, block/block all reject overlaps", () =>
  as("a", async () => {
    const b = await block();
    await assert.rejects(
      reserve("2031-09-14", "2031-09-20"),
      (e) => e.code === "23P01",
    );
    await assert.rejects(
      block("2031-09-12", "2031-09-17"),
      (e) => e.code === "23P01",
    );
    await reserve("2031-09-15", "2031-09-20");
    await assert.rejects(
      block("2031-09-19", "2031-09-21"),
      (e) => e.code === "23P01",
    );
    await db.query(
      "update public.property_blocks set active=false where id=$1",
      [b.id],
    );
    await reserve("2031-09-10", "2031-09-15");
    await assert.rejects(
      db.query("update public.property_blocks set active=true where id=$1", [
        b.id,
      ]),
      (e) => e.code === "23P01",
    );
  }));
test("moving between properties also rechecks registry", () =>
  as("a", async () => {
    const r = await reserve("2032-01-10", "2032-01-15");
    await reserve("2032-01-10", "2032-01-15", other);
    await assert.rejects(
      db.query("update public.reservations set property_id=$1 where id=$2", [
        other,
        r.id,
      ]),
      (e) => e.code === "23P01",
    );
  }));
test("tenant B cannot read update insert delete A reservations or blocks directly", () =>
  as("b", async () => {
    for (const table of ["reservations", "property_blocks"]) {
      assert.equal(
        (
          await one(
            `select count(*)::int n from public.${table} where organization_id=$1`,
            [alpha],
          )
        ).n,
        0,
      );
      assert.equal(
        (
          await db.query(
            `update public.${table} set version=999 where organization_id=$1 returning id`,
            [alpha],
          )
        ).rows.length,
        0,
      );
      await assert.rejects(
        db.query(`delete from public.${table} where organization_id=$1`, [
          alpha,
        ]),
        (e) => e.code === "42501",
      );
    }
    await assert.rejects(
      reserve("2034-01-01", "2034-01-05"),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      block("2034-01-01", "2034-01-05"),
      (e) => e.code === "42501",
    );
    await reserve("2034-01-01", "2034-01-05", foreign, beta);
  }));
test("composite property relation rejects cross-tenant property injection", () =>
  as("a", async () => {
    await assert.rejects(
      reserve("2034-02-01", "2034-02-05", foreign),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      block("2034-02-01", "2034-02-05", foreign),
      (e) => e.code === "23503",
    );
  }));
test("staff and anonymous cannot manage reservations or blocks", async () => {
  await as("staff", async () => {
    for (const t of ["reservations", "property_blocks"])
      assert.equal((await one(`select count(*)::int n from public.${t}`)).n, 0);
    await assert.rejects(
      reserve("2034-03-01", "2034-03-05"),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      block("2034-03-01", "2034-03-05"),
      (e) => e.code === "42501",
    );
  });
  await as(null, async () => {
    await assert.rejects(
      db.query("select * from public.reservations"),
      (e) => e.code === "42501",
    );
  });
});
test("manager and admin reuse current membership permissions", async () => {
  await as("manager", () => reserve("2034-04-01", "2034-04-05"));
  await as("admin", () => block("2034-05-01", "2034-05-05"));
});
test("invalid dates, capacity, source and identity rejected", () =>
  as("a", async () => {
    await assert.rejects(
      reserve("2035-01-01", "2035-01-01"),
      (e) => e.code === "23514",
    );
    await assert.rejects(
      reserve("2035-01-02", "2035-01-01"),
      (e) => e.code === "23514",
    );
    const r = await reserve("2035-01-01", "2035-01-05");
    await assert.rejects(
      db.query("update public.reservations set source='airbnb' where id=$1", [
        r.id,
      ]),
      (e) => e.code === "23514",
    );
    await assert.rejects(
      db.query("update public.reservations set guests_count=5 where id=$1", [
        r.id,
      ]),
      (e) => e.code === "23514",
    );
    await assert.rejects(
      db.query(
        "update public.reservations set organization_id=$1 where id=$2",
        [beta, r.id],
      ),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      db.query("update public.reservations set created_by=$1 where id=$2", [
        users.b,
        r.id,
      ]),
      (e) => e.code === "42501",
    );
  }));
test("private registry and definer function have no client access", () =>
  as("a", async () => {
    await assert.rejects(
      db.query("select * from private.property_occupancy"),
      (e) => e.code === "42501",
    );
    await assert.rejects(
      db.query("delete from private.property_occupancy"),
      (e) => e.code === "42501",
    );
    assert.equal(
      (
        await one(
          "select has_function_privilege('authenticated','private.sync_stay_occupancy()','execute') allowed",
        )
      ).allowed,
      false,
    );
  }));
test("optimistic version check prevents lost updates", () =>
  as("a", async () => {
    const r = await reserve("2036-01-01", "2036-01-05");
    assert.equal(
      (
        await db.query(
          "update public.reservations set internal_notes='first' where id=$1 and version=$2 returning id",
          [r.id, r.version],
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await db.query(
          "update public.reservations set internal_notes='second' where id=$1 and version=$2 returning id",
          [r.id, r.version],
        )
      ).rows.length,
      0,
    );
  }));
test("block edits roll back conflicting dates and preserve occupancy", () =>
  as("a", async () => {
    const p = await propertyFor(alpha);
    const b = await block("2040-01-01", "2040-01-05", p);
    await reserve("2040-01-05", "2040-01-10", p);
    await assert.rejects(
      db.query(
        "update public.property_blocks set end_date='2040-01-06' where id=$1",
        [b.id],
      ),
      (e) => e.code === "23P01",
    );
    assert.equal(
      (
        await one(
          "select end_date::text from public.property_blocks where id=$1",
          [b.id],
        )
      ).end_date,
      "2040-01-05",
    );
    await assert.rejects(
      reserve("2040-01-01", "2040-01-02", p),
      (e) => e.code === "23P01",
    );
    for (const end of ["2040-02-01", "2040-01-31"])
      await assert.rejects(
        block("2040-02-01", end, p),
        (e) => e.code === "23514",
      );
  }));
test("inactive and archived properties reject active stays but allow cancellation and release", () =>
  as("a", async () => {
    for (const status of ["inactive", "archived"]) {
      const p = await propertyFor(alpha);
      const r = await reserve("2041-01-01", "2041-01-05", p);
      const b = await block("2041-02-01", "2041-02-05", p);
      await db.query("update public.properties set status=$1 where id=$2", [
        status,
        p,
      ]);
      await assert.rejects(
        reserve("2041-03-01", "2041-03-05", p),
        /property_not_active/,
      );
      await assert.rejects(
        block("2041-03-01", "2041-03-05", p),
        /property_not_active/,
      );
      await db.query(
        "update public.reservations set status='cancelled' where id=$1",
        [r.id],
      );
      await db.query(
        "update public.property_blocks set active=false where id=$1",
        [b.id],
      );
    }
  }));
test("missing property and deletion cannot create dangling stays", async () => {
  const p = await as("a", () => propertyFor(alpha));
  await as("a", async () => {
    await reserve("2042-01-01", "2042-01-05", p);
    await assert.rejects(
      reserve("2042-02-01", "2042-02-05", randomUUID()),
      (e) => e.code === "23503",
    );
    await assert.rejects(
      block("2042-02-01", "2042-02-05", randomUUID()),
      (e) => e.code === "23503",
    );
  });
  await db.exec("reset role");
  await assert.rejects(
    db.query("delete from public.properties where id=$1", [p]),
    /reservations_organization_id_property_id_fkey/,
  );
});
test("all existing operational roles can read create edit cancel and release; restricted roles cannot", async () => {
  for (const role of ["a", "admin", "manager"]) {
    await as(role, async () => {
      const p = await propertyFor(alpha);
      const r = await reserve("2043-01-01", "2043-01-05", p);
      const b = await block("2043-02-01", "2043-02-05", p);
      assert.ok(
        await one("select id from public.reservations where id=$1", [r.id]),
      );
      await db.query(
        "update public.reservations set check_out='2043-01-06' where id=$1",
        [r.id],
      );
      await db.query(
        "update public.property_blocks set end_date='2043-02-06' where id=$1",
        [b.id],
      );
      await db.query(
        "update public.reservations set status='cancelled' where id=$1",
        [r.id],
      );
      await db.query(
        "update public.property_blocks set active=false where id=$1",
        [b.id],
      );
    });
  }
  for (const role of ["staff", "property_owner", "guest"]) {
    await as(role, async () => {
      for (const table of ["reservations", "property_blocks"]) {
        assert.equal(
          (await one(`select count(*)::int n from public.${table}`)).n,
          0,
        );
        assert.equal(
          (
            await db.query(
              `update public.${table} set version=999 returning id`,
            )
          ).rows.length,
          0,
        );
        await assert.rejects(
          db.query(`delete from public.${table}`),
          (e) => e.code === "42501",
        );
      }
      await assert.rejects(
        reserve("2043-03-01", "2043-03-05"),
        (e) => e.code === "42501",
      );
      await assert.rejects(
        block("2043-03-01", "2043-03-05"),
        (e) => e.code === "42501",
      );
    });
  }
});
test("suspended membership loses all reads and writes immediately", async () => {
  await db.exec("reset role");
  await db.query(
    "update public.organization_members set status='suspended' where organization_id=$1 and user_id=$2",
    [alpha, users.manager],
  );
  await as("manager", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.reservations")).n,
      0,
    );
    await assert.rejects(
      reserve("2037-01-01", "2037-01-05"),
      (e) => e.code === "42501",
    );
  });
});
