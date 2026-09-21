import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
let db, alpha, beta, property;
const users = Object.fromEntries(
  ["a", "b", "manager", "staff", "admin"].map((n) => [n, randomUUID()]),
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
const fields = {
  name: "Maison Alpha",
  internal_name: "ALP-01",
  status: "active",
  address_line1: "1 rue Test",
  address_line2: null,
  postal_code: "1000",
  city: "Bruxelles",
  country: "BE",
  latitude: null,
  longitude: null,
  property_type: "house",
  capacity: 4,
  bedrooms: 2,
  beds: 3,
  bathrooms: 1.5,
  check_in_time: "15:00",
  check_out_time: "11:00",
  wifi_name: "Alpha wifi",
  wifi_password: "test-only-secret",
  access_instructions: "Test-only access",
  cleaning_instructions: null,
  private_notes: "test-only-private",
  cleaning_fee: 40,
  management_commission_percent: 20,
};
const save = (
  org,
  id,
  data = fields,
  amenities = ["wifi", "kitchen"],
  version = null,
) =>
  one("select public.save_property($1,$2,$3,$4,$5) id", [
    org,
    id,
    JSON.stringify(data),
    amenities,
    version,
  ]);
before(async () => {
  db = new PGlite({ extensions: { pgcrypto, btree_gist } });
  await db.waitReady;
  await db.exec(
    "create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,owner_id text,unique(bucket_id,name));alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert,update,delete on storage.objects to authenticated;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(dir))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await db.exec(await readFile(new URL(file, dir), "utf8"));
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
  for (const name of ["manager", "staff", "admin"])
    await db.query(
      "insert into public.organization_members(organization_id,user_id,display_name,role,created_by) values($1,$2,$3::text,$3::text::public.organization_role,$4)",
      [alpha, users[name], name, users.a],
    );
  property = randomUUID();
  await as("a", () => save(alpha, property));
});
after(async () => await db?.close());
test("creates a real property with tenant, creator, version and normalized amenities", () =>
  as("a", async () => {
    const row = await one("select * from public.properties where id=$1", [
      property,
    ]);
    assert.equal(row.name, fields.name);
    assert.equal(row.created_by, users.a);
    assert.equal(row.version, 1);
    assert.equal(row.owner_id, null);
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.property_amenities where property_id=$1",
          [property],
        )
      ).n,
      2,
    );
  }));
test("retry of uncertain creation is idempotent", () =>
  as("a", async () => {
    assert.equal((await save(alpha, property)).id, property);
    assert.equal(
      (await one("select count(*)::int n from public.properties")).n,
      1,
    );
  }));
test("manager edits fields and replaces amenities atomically", () =>
  as("manager", async () => {
    await save(
      alpha,
      property,
      { ...fields, name: "Villa Alpha", capacity: 6 },
      ["pool", "wifi"],
      1,
    );
    assert.equal(
      (
        await one("select capacity from public.properties where id=$1", [
          property,
        ])
      ).capacity,
      6,
    );
    assert.deepEqual(
      (
        await db.query(
          "select amenity_id from public.property_amenities where property_id=$1 order by amenity_id",
          [property],
        )
      ).rows.map((x) => x.amenity_id),
      ["pool", "wifi"],
    );
  }));
test("stale form cannot overwrite a newer edit", () =>
  as("a", async () => {
    await assert.rejects(save(alpha, property, fields, ["wifi"], 1), {
      code: "PT409",
      message: "property_conflict",
    });
    assert.equal(
      (
        await one("select version from public.properties where id=$1", [
          property,
        ])
      ).version,
      2,
    );
  }));
test("invalid amenity rolls back the entire field update", () =>
  as("a", async () => {
    await assert.rejects(
      save(
        alpha,
        property,
        { ...fields, name: "Must rollback" },
        ["does_not_exist"],
        2,
      ),
      /foreign key/,
    );
    assert.equal(
      (await one("select name from public.properties where id=$1", [property]))
        .name,
      "Villa Alpha",
    );
  }));
test("SQL rejects invalid numeric constraints and incomplete coordinates", () =>
  as("a", async () => {
    for (const patch of [
      { capacity: 0 },
      { bedrooms: -1 },
      { beds: -1 },
      { bathrooms: -1 },
      { management_commission_percent: 101 },
      { cleaning_fee: -1 },
      { latitude: 91, longitude: 1 },
      { latitude: 1, longitude: null },
      { check_in_time: "24:00" },
    ])
      await assert.rejects(
        save(alpha, randomUUID(), { ...fields, ...patch }),
        /check constraint/,
      );
  }));
test("Beta receives no Alpha rows or sensitive fields and cannot mutate", () =>
  as("b", async () => {
    for (const table of ["properties", "property_amenities", "property_images"])
      assert.equal(
        (
          await one(
            `select count(*)::int n from public.${table} where organization_id=$1`,
            [alpha],
          )
        ).n,
        0,
      );
    await assert.rejects(save(alpha, property, fields, [], 2), /forbidden/);
    assert.equal(
      (
        await db.query(
          "update public.properties set name=$1 where id=$2 returning id",
          ["Attack", property],
        )
      ).rows.length,
      0,
    );
  }));
test("staff cannot read portfolio or access fields and cannot create", () =>
  as("staff", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.properties")).n,
      0,
    );
    await assert.rejects(save(alpha, randomUUID()), /forbidden/);
  }));
test("anonymous access to properties and equipment catalog is refused", () =>
  as(null, async () => {
    for (const table of [
      "properties",
      "property_images",
      "property_amenities",
      "amenities",
    ])
      await assert.rejects(
        db.query(`select * from public.${table}`),
        /permission denied/,
      );
  }));
test("tenant identity, creator and future owner relation are guarded", () =>
  as("a", async () => {
    await assert.rejects(
      db.query("update public.properties set organization_id=$1 where id=$2", [
        beta,
        property,
      ]),
      /property_identity_immutable/,
    );
    await assert.rejects(
      db.query("update public.properties set created_by=$1 where id=$2", [
        users.b,
        property,
      ]),
      /property_identity_immutable/,
    );
    await assert.rejects(
      db.query("update public.properties set owner_id=$1 where id=$2", [
        randomUUID(),
        property,
      ]),
      /property_identity_immutable/,
    );
    await assert.rejects(
      db.query("delete from public.properties where id=$1", [property]),
      /permission denied/,
    );
  }));
let images = [];
test("multiple private image reservations require an actual stored object before finalization", () =>
  as("a", async () => {
    for (let i = 0; i < 2; i++) {
      const id = randomUUID();
      const path = (
        await one("select public.reserve_property_image($1,$2,$3,$4,$5) path", [
          alpha,
          property,
          id,
          "image/png",
          68,
        ])
      ).path;
      await assert.rejects(
        db.query("select public.finish_property_image($1,$2,$3)", [
          alpha,
          property,
          id,
        ]),
        /image_file_missing/,
      );
      await db.query(
        "insert into storage.objects(bucket_id,name) values($1,$2)",
        ["property-photos", path],
      );
      await db.query("select public.finish_property_image($1,$2,$3)", [
        alpha,
        property,
        id,
      ]);
      images.push({ id, path });
    }
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.property_images where is_cover",
        )
      ).n,
      1,
    );
  }));
test("Beta cannot list, download via RLS, insert or delete Alpha photo objects", () =>
  as("b", async () => {
    assert.equal(
      (await one("select count(*)::int n from storage.objects")).n,
      0,
    );
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
        "property-photos",
        images[0].path + "x",
      ]),
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          "delete from storage.objects where name=$1 returning id",
          [images[0].path],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("select public.reserve_property_image($1,$2,$3,$4,$5)", [
        alpha,
        property,
        randomUUID(),
        "image/png",
        68,
      ]),
      /forbidden/,
    );
  }));
test("image metadata rejects mismatched tenant and object path", () =>
  as("a", async () => {
    await assert.rejects(
      db.query(
        "update public.property_images set storage_path=$1 where id=$2",
        ["different/path", images[0].id],
      ),
      /image_identity_immutable/,
    );
    await assert.rejects(
      db.query(
        "insert into public.property_amenities(organization_id,property_id,amenity_id) values($1,$2,$3)",
        [beta, property, "wifi"],
      ),
      /row-level security|foreign key/,
    );
  }));
test("cover and image order change together; stale/foreign image lists are refused", () =>
  as("manager", async () => {
    await db.query("select public.arrange_property_images($1,$2,$3,$4)", [
      alpha,
      property,
      [images[1].id, images[0].id],
      images[1].id,
    ]);
    assert.equal(
      (await one("select id from public.property_images where is_cover")).id,
      images[1].id,
    );
    assert.equal(
      (
        await one("select sort_order from public.property_images where id=$1", [
          images[1].id,
        ])
      ).sort_order,
      0,
    );
    await assert.rejects(
      db.query("select public.arrange_property_images($1,$2,$3,$4)", [
        alpha,
        property,
        [randomUUID(), images[0].id],
        images[0].id,
      ]),
      { code: "PT409", message: "image_order_conflict" },
    );
  }));
test("deletion removes bytes first and selects the next cover", () =>
  as("a", async () => {
    await assert.rejects(
      db.query("delete from public.property_images where id=$1", [
        images[1].id,
      ]),
      /image_file_exists/,
    );
    await db.query("select public.prepare_property_image_delete($1,$2,$3)", [
      alpha,
      property,
      images[1].id,
    ]);
    assert.equal(
      (await one("select id from public.property_images where is_cover")).id,
      images[0].id,
    );
    await db.query("delete from storage.objects where name=$1", [
      images[1].path,
    ]);
    await db.query("delete from public.property_images where id=$1", [
      images[1].id,
    ]);
  }));
test("manager cannot archive through RPC or direct REST-equivalent SQL", () =>
  as("manager", async () => {
    await assert.rejects(
      db.query("select public.set_property_archived($1,$2,true,2)", [
        alpha,
        property,
      ]),
      /property_archive_forbidden/,
    );
    await assert.rejects(
      db.query("update public.properties set status='archived' where id=$1", [
        property,
      ]),
      /property_archive_forbidden/,
    );
  }));
test("archive preserves fields, equipment and files; restore returns inactive", () =>
  as("admin", async () => {
    await db.query("select public.set_property_archived($1,$2,true,2)", [
      alpha,
      property,
    ]);
    assert.equal(
      (
        await one("select status from public.properties where id=$1", [
          property,
        ])
      ).status,
      "archived",
    );
    assert.equal(
      (await one("select count(*)::int n from storage.objects")).n,
      1,
    );
    await assert.rejects(
      save(alpha, property, fields, [], 3),
      /property_archived/,
    );
    await assert.rejects(
      db.query("select public.reserve_property_image($1,$2,$3,$4,$5)", [
        alpha,
        property,
        randomUUID(),
        "image/png",
        68,
      ]),
      /forbidden/,
    );
    await db.query("select public.set_property_archived($1,$2,false,3)", [
      alpha,
      property,
    ]);
    assert.equal(
      (
        await one("select status from public.properties where id=$1", [
          property,
        ])
      ).status,
      "inactive",
    );
  }));
test("membership suspension revokes property and Storage reads immediately", async () => {
  await as("a", async () => {
    const m = await one(
      "select id from public.organization_members where user_id=$1",
      [users.manager],
    );
    await db.query(
      "select public.update_membership($1,$2,'manager','suspended')",
      [alpha, m.id],
    );
  });
  await as("manager", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.properties")).n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from storage.objects")).n,
      0,
    );
  });
});
test("catalog enforces RLS, private bucket limits, invoker RPCs and indexes", async () => {
  await db.exec("reset role");
  for (const name of [
    "properties",
    "property_images",
    "property_amenities",
    "amenities",
  ])
    assert.equal(
      (
        await one(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          ["public." + name],
        )
      ).relrowsecurity,
      true,
    );
  assert.equal(
    (await one("select public from storage.buckets where id='property-photos'"))
      .public,
    false,
  );
  assert.equal(
    (
      await one(
        "select file_size_limit::int n from storage.buckets where id='property-photos'",
      )
    ).n,
    5242880,
  );
  assert.equal(
    (
      await one(
        "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like '%property%' and p.prosecdef",
      )
    ).n,
    0,
  );
  assert.ok(
    (
      await one(
        "select count(*)::int n from pg_indexes where tablename='properties'",
      )
    ).n >= 6,
  );
  const audits = (
    await db.query(
      "select metadata from public.audit_logs where entity_type in ('properties','property_images')",
    )
  ).rows;
  assert.ok(audits.length > 0);
  assert.ok(audits.every((x) => !JSON.stringify(x).includes("secret")));
});

test("admin can create, edit, archive and restore within its organization", () =>
  as("admin", async () => {
    const id = randomUUID();
    await save(alpha, id);
    let row = await one("select * from public.properties where id=$1", [id]);
    assert.equal(row.created_by, users.admin);
    await save(
      alpha,
      id,
      { ...fields, name: "Admin update" },
      ["wifi"],
      row.version,
    );
    row = await one("select * from public.properties where id=$1", [id]);
    assert.equal(row.name, "Admin update");
    await db.query("select public.set_property_archived($1,$2,true,$3)", [
      alpha,
      id,
      row.version,
    ]);
    row = await one(
      "select status,version from public.properties where id=$1",
      [id],
    );
    assert.equal(row.status, "archived");
    await db.query("select public.set_property_archived($1,$2,false,$3)", [
      alpha,
      id,
      row.version,
    ]);
    assert.equal(
      (await one("select status from public.properties where id=$1", [id]))
        .status,
      "inactive",
    );
  }));
