import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
// PostgreSQL RLS tests, NOT a substitute for live Supabase Auth/E2E acceptance.
let db, alpha, beta, ownerId, adminId, staffId, legacy;
const ids = Object.fromEntries(
  [
    "a",
    "b",
    "admin",
    "manager",
    "staff",
    "invite",
    "unverified",
    "coowner",
    "legacy",
  ].map((name, i) => [
    name,
    `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
const one = async (sql, args = []) => (await db.query(sql, args)).rows[0];
async function as(user, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user ? ids[user] : "",
  ]);
  await db.exec(user ? "set role authenticated" : "set role anon");
  return fn();
}
async function invite(owner, org, user, role) {
  const { token } = await as(owner, () =>
    one("select public.create_invitation($1,$2,$3) token", [
      org,
      user + "@hostflow.test",
      role,
    ]),
  );
  await as(user, () =>
    db.query("select public.accept_invitation($1)", [token]),
  );
}
before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;",
  );
  const dir = new URL("../supabase/migrations/", import.meta.url);
  const files = (await readdir(dir))
    .filter((f) =>
      /_(foundations|foundation_roles|foundation_v02)\.sql$/.test(f),
    )
    .sort();
  await db.exec(await readFile(new URL(files[0], dir), "utf8"));
  await db.query(
    "insert into auth.users(id,email,email_confirmed_at) values($1,'legacy@hostflow.test',now())",
    [ids.legacy],
  );
  legacy = (
    await as("legacy", () =>
      one(
        "select public.create_organization('Legacy','legacy','Europe/Brussels','EUR','Legacy Name') id",
      ),
    )
  ).id;
  await db.exec("reset role");
  for (const file of files.slice(1))
    await db.exec(await readFile(new URL(file, dir), "utf8"));
  for (const [name, id] of Object.entries(ids).filter(
    ([name]) => name !== "legacy",
  ))
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)",
      [
        id,
        name + "@hostflow.test",
        name === "unverified" ? null : new Date().toISOString(),
        JSON.stringify({ first_name: name, last_name: "Test", role: "owner" }),
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
        "select public.create_organization('Beta','beta','Europe/Paris','EUR','FR') id",
      ),
    )
  ).id;
  await invite("a", alpha, "admin", "admin");
  await invite("a", alpha, "manager", "manager");
  await invite("admin", alpha, "staff", "staff");
  await as("a", async () => {
    ownerId = (
      await one("select id from public.organization_members where user_id=$1", [
        ids.a,
      ])
    ).id;
    adminId = (
      await one("select id from public.organization_members where user_id=$1", [
        ids.admin,
      ])
    ).id;
    staffId = (
      await one("select id from public.organization_members where user_id=$1", [
        ids.staff,
      ])
    ).id;
  });
});
after(async () => await db?.close());
test("compatible migration keeps legacy memberships, creates profiles and promotes creator", async () => {
  await as("legacy", async () => {
    assert.equal(
      (
        await one(
          "select role from public.organization_members where organization_id=$1",
          [legacy],
        )
      ).role,
      "owner",
    );
    assert.equal(
      (
        await one(
          "select id from public.organization_memberships where organization_id=$1",
          [legacy],
        )
      ).id,
      (
        await one(
          "select id from public.organization_members where organization_id=$1",
          [legacy],
        )
      ).id,
    );
    assert.equal(
      (await one("select first_name from public.profiles")).first_name,
      "Legacy",
    );
  });
});
test("A creates Alpha and becomes its only owner atomically", async () => {
  await as("a", async () => {
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.organization_members where organization_id=$1 and role='owner' and status='active'",
          [alpha],
        )
      ).n,
      1,
    );
    assert.equal(
      (
        await one("select country from public.organizations where id=$1", [
          alpha,
        ])
      ).country,
      "BE",
    );
    assert.ok(
      (await one("select count(*)::int n from public.audit_logs")).n > 0,
    );
  });
});
test("CRITICAL: B cannot read ANY Alpha organization, member, invitation, audit or profile", async () => {
  await as("b", async () => {
    for (const table of [
      "organizations",
      "organization_members",
      "organization_memberships",
      "organization_invitations",
      "audit_logs",
    ]) {
      const col = table === "organizations" ? "id" : "organization_id";
      assert.equal(
        (
          await one(
            `select count(*)::int n from public.${table} where ${col}=$1`,
            [alpha],
          )
        ).n,
        0,
        table,
      );
    }
    assert.equal(
      (
        await one("select count(*)::int n from public.profiles where id=$1", [
          ids.a,
        ])
      ).n,
      0,
    );
    await assert.rejects(
      db.query("select * from public.list_team($1)", [alpha]),
      /forbidden/,
    );
  });
});
test("A is equally isolated from Beta", async () => {
  await as("a", async () => {
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.organizations where id=$1",
          [beta],
        )
      ).n,
      0,
    );
    await assert.rejects(
      db.query("select * from public.list_team($1)", [beta]),
      /forbidden/,
    );
  });
});
test("B cannot modify Alpha or target Alpha members with its own tenant id", async () => {
  await as("b", async () => {
    await assert.rejects(
      db.query(
        "select public.update_organization($1,'Intrusion','Europe/Paris','EUR','FR')",
        [alpha],
      ),
      /forbidden/,
    );
    await assert.rejects(
      db.query("select public.update_membership($1,$2,'admin','active')", [
        beta,
        ownerId,
      ]),
      /member_not_found/,
    );
    await assert.rejects(
      db.query("select public.remove_member($1,$2)", [alpha, staffId]),
      /forbidden/,
    );
    await assert.rejects(
      db.query(
        "select public.create_invitation($1,'intruder@hostflow.test','staff')",
        [alpha],
      ),
      /forbidden/,
    );
    await assert.rejects(
      db.query("select public.complete_team_setup($1)", [alpha]),
      /forbidden/,
    );
  });
});
test("profiles are self-only and protected against ID reassignment", async () => {
  await as("a", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.profiles")).n,
      1,
    );
    await db.query(
      "update public.profiles set first_name='Alice',phone='+32400000000' where id=$1",
      [ids.a],
    );
    assert.equal(
      (await one("select first_name from public.profiles")).first_name,
      "Alice",
    );
    assert.equal(
      (
        await db.query(
          "update public.profiles set first_name='Intrusion' where id=$1 returning id",
          [ids.b],
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.query("update public.profiles set id=$1", [ids.b]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.profiles"),
      /permission denied/,
    );
  });
});
test("roster exposes current name, email, role and status only within the tenant", async () => {
  await as("manager", async () => {
    const rows = (await db.query("select * from public.list_team($1)", [alpha]))
      .rows;
    assert.equal(rows.length, 4);
    assert.equal(
      rows.find((r) => r.user_id === ids.a).display_name,
      "Alice Test",
    );
    assert.equal(
      rows.find((r) => r.user_id === ids.a).email,
      "a@hostflow.test",
    );
    assert.equal(rows.find((r) => r.user_id === ids.a).role, "owner");
    assert.ok(!Object.hasOwn(rows[0], "phone"));
    assert.equal(
      (await one("select count(*)::int n from public.profiles")).n,
      1,
    );
  });
});
test("staff sees own membership and roster row; no colleague profiles, invitations or audit", async () => {
  await as("staff", async () => {
    assert.equal(
      (await db.query("select * from public.list_team($1)", [alpha])).rows
        .length,
      1,
    );
    assert.equal(
      (await one("select count(*)::int n from public.organization_members")).n,
      1,
    );
    assert.equal(
      (await one("select count(*)::int n from public.organization_invitations"))
        .n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from public.audit_logs")).n,
      0,
    );
  });
});
test("manager and staff cannot invite, change roles, configure org or complete onboarding", async () => {
  for (const who of ["manager", "staff"])
    await as(who, async () => {
      await assert.rejects(
        db.query(
          "select public.create_invitation($1,'x@hostflow.test','staff')",
          [alpha],
        ),
        /forbidden/,
      );
      await assert.rejects(
        db.query("select public.update_membership($1,$2,'owner','active')", [
          alpha,
          staffId,
        ]),
        /forbidden/,
      );
      await assert.rejects(
        db.query(
          "select public.update_organization($1,'Bad','Europe/Paris','EUR','FR')",
          [alpha],
        ),
        /forbidden/,
      );
      await assert.rejects(
        db.query("select public.complete_team_setup($1)", [alpha]),
        /forbidden/,
      );
    });
});
test("admin may manage staff, but cannot elevate itself or touch any owner/admin", async () => {
  await as("admin", async () => {
    await db.query(
      "select public.update_membership($1,$2,'manager','active')",
      [alpha, staffId],
    );
    for (const target of [ownerId, adminId]) {
      await assert.rejects(
        db.query("select public.update_membership($1,$2,'staff','active')", [
          alpha,
          target,
        ]),
        /owner_required/,
      );
      await assert.rejects(
        db.query("select public.remove_member($1,$2)", [alpha, target]),
        /owner_required/,
      );
    }
    await assert.rejects(
      db.query("select public.update_membership($1,$2,'admin','active')", [
        alpha,
        staffId,
      ]),
      /owner_required/,
    );
    await assert.rejects(
      db.query(
        "select public.create_invitation($1,'x@hostflow.test','admin')",
        [alpha],
      ),
      /owner_required/,
    );
    await db.query("select public.update_membership($1,$2,'staff','active')", [
      alpha,
      staffId,
    ]);
  });
});
test("last owner cannot be demoted, suspended or removed", async () => {
  await as("a", async () => {
    await assert.rejects(
      db.query("select public.update_membership($1,$2,'admin','active')", [
        alpha,
        ownerId,
      ]),
      /last_owner_required/,
    );
    await assert.rejects(
      db.query("select public.update_membership($1,$2,'owner','suspended')", [
        alpha,
        ownerId,
      ]),
      /last_owner_required/,
    );
    await assert.rejects(
      db.query("select public.remove_member($1,$2)", [alpha, ownerId]),
      /last_owner_required/,
    );
  });
});
test("anonymous has no public/private RPC execution or table access", async () => {
  await as(null, async () => {
    for (const table of [
      "organizations",
      "organization_members",
      "organization_memberships",
      "organization_invitations",
      "audit_logs",
      "profiles",
    ])
      await assert.rejects(
        db.query(`select count(*) from public.${table}`),
        /permission denied/,
      );
    await assert.rejects(
      db.query(
        "select public.create_organization('Bad','bad','Europe/Paris','EUR','FR')",
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.list_team($1)", [alpha]),
      /permission denied/,
    );
  });
});
test("authenticated with empty identity and unverified account cannot bootstrap", async () => {
  await as("unverified", () =>
    assert.rejects(
      db.query(
        "select public.create_organization('Bad','bad','Europe/Paris','EUR','FR')",
      ),
      /verified_user_required/,
    ),
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec("set role authenticated");
  await assert.rejects(
    db.query(
      "select public.create_organization('Bad','bad','Europe/Paris','EUR','FR')",
    ),
    /verified_user_required/,
  );
});
test("direct writes, private helper execution and metadata-based role escalation denied", async () => {
  await as("staff", async () => {
    await assert.rejects(
      db.query("update public.organization_members set role='owner'"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into private.platform_admins(user_id) values($1)", [
        ids.staff,
      ]),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select private.check_member_change($1,$2,'owner','active')", [
        alpha,
        staffId,
      ]),
      /permission denied/,
    );
    assert.equal(
      (await one("select role from public.organization_members")).role,
      "staff",
    );
  });
});
test("organization settings constraints and uniqueness roll back invalid bootstrap", async () => {
  await as("a", async () => {
    for (const [slug, tz, country] of [
      ["invalid-country", "Europe/Paris", ""],
      ["invalid-timezone", "Wrong/Zone", "FR"],
      ["alpha", "Europe/Paris", "FR"],
    ])
      await assert.rejects(
        db.query("select public.create_organization('Bad',$1,$2,'EUR',$3)", [
          slug,
          tz,
          country,
        ]),
      );
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.organizations where slug in ('invalid-country','invalid-timezone')",
        )
      ).n,
      0,
    );
  });
});
test("reserved roles and owner invitations cannot be assigned", async () => {
  await as("a", async () => {
    for (const role of [
      "property_owner",
      "guest",
      "organization_admin",
      "owner",
    ])
      await assert.rejects(
        db.query(
          "select public.create_invitation($1,'reserved@hostflow.test',$2)",
          [alpha, role],
        ),
        /unsupported_role/,
      );
  });
});
test("invitation token is hashed, not readable, bound to confirmed email and single use", async () => {
  const token = (
    await as("a", () =>
      one(
        "select public.create_invitation($1,'invite@hostflow.test','staff') token",
        [alpha],
      ),
    )
  ).token;
  assert.match(token, /^[a-f0-9]{64}$/);
  await as("a", () =>
    assert.rejects(
      db.query("select token_hash from public.organization_invitations"),
      /permission denied/,
    ),
  );
  await as("b", () =>
    assert.rejects(
      db.query("select public.accept_invitation($1)", [token]),
      /invitation_unavailable/,
    ),
  );
  await as("invite", async () => {
    assert.equal(
      (await one("select public.accept_invitation($1) org", [token])).org,
      alpha,
    );
    await assert.rejects(
      db.query("select public.accept_invitation($1)", [token]),
      /invitation_unavailable/,
    );
    assert.equal(
      (await one("select role from public.organization_members")).role,
      "staff",
    );
  });
  await as("a", async () => {
    const row = await one(
      "select status,invited_by from public.organization_invitations where email='invite@hostflow.test'",
    );
    assert.equal(row.status, "accepted");
    assert.equal(row.invited_by, ids.a);
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.audit_logs where metadata::text like $1",
          ["%" + token + "%"],
        )
      ).n,
      0,
    );
  });
});
test("revoked and expired invitations cannot be accepted", async () => {
  for (const mode of ["revoke", "expire"]) {
    const token = (
      await as("a", () =>
        one(
          "select public.create_invitation($1,'coowner@hostflow.test','admin') token",
          [alpha],
        ),
      )
    ).token;
    if (mode === "revoke")
      await as("a", async () => {
        const row = await one(
          "select id from public.organization_invitations where email='coowner@hostflow.test' and status='pending'",
        );
        await db.query("select public.revoke_invitation($1,$2)", [
          alpha,
          row.id,
        ]);
      });
    else {
      await db.exec("reset role");
      await db.exec(
        "update public.organization_invitations set expires_at=now()-interval '1 second' where email='coowner@hostflow.test' and status='pending'",
      );
    }
    await as("coowner", () =>
      assert.rejects(
        db.query("select public.accept_invitation($1)", [token]),
        /invitation_unavailable/,
      ),
    );
  }
});
test("admin cannot revoke or overwrite pending admin invitation", async () => {
  await as("a", () =>
    db.query(
      "select public.create_invitation($1,'coowner@hostflow.test','admin')",
      [alpha],
    ),
  );
  await as("admin", async () => {
    const row = await one(
      "select id from public.organization_invitations where email='coowner@hostflow.test' and status='pending'",
    );
    await assert.rejects(
      db.query("select public.revoke_invitation($1,$2)", [alpha, row.id]),
      /owner_required/,
    );
    await assert.rejects(
      db.query(
        "select public.create_invitation($1,'coowner@hostflow.test','staff')",
        [alpha],
      ),
      /owner_required/,
    );
  });
});
test("one user can have different roles in Alpha and Beta; role never carries across", async () => {
  await invite("b", beta, "a", "staff");
  await as("a", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organizations")).n,
      2,
    );
    await assert.rejects(
      db.query(
        "select public.update_organization($1,'Wrong role','Europe/Paris','EUR','FR')",
        [beta],
      ),
      /forbidden/,
    );
  });
});
test("suspension immediately removes tenant access despite unchanged JWT identity", async () => {
  await as("a", () =>
    db.query("select public.update_membership($1,$2,'staff','suspended')", [
      alpha,
      staffId,
    ]),
  );
  await as("staff", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organizations")).n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from public.organization_members")).n,
      0,
    );
    await assert.rejects(
      db.query("select * from public.list_team($1)", [alpha]),
      /forbidden/,
    );
    assert.equal(
      (await one("select count(*)::int n from public.profiles")).n,
      1,
    );
  });
  await as("a", () =>
    db.query("select public.update_membership($1,$2,'staff','active')", [
      alpha,
      staffId,
    ]),
  );
});
test("removal preserves personal account/profile and records audit; reinvitation works", async () => {
  await as("admin", () =>
    db.query("select public.remove_member($1,$2)", [alpha, staffId]),
  );
  await as("staff", async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organizations")).n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from public.profiles")).n,
      1,
    );
  });
  await as("a", async () =>
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.audit_logs where entity_id=$1 and action='delete'",
          [staffId],
        )
      ).n,
      1,
    ),
  );
  await invite("a", alpha, "staff", "staff");
});
test("team setup completion persists and is idempotent", async () => {
  await as("b", async () => {
    await db.query("select public.complete_team_setup($1)", [beta]);
    const first = (
      await one(
        "select team_setup_completed_at from public.organizations where id=$1",
        [beta],
      )
    ).team_setup_completed_at;
    await db.query("select public.complete_team_setup($1)", [beta]);
    assert.deepEqual(
      (
        await one(
          "select team_setup_completed_at from public.organizations where id=$1",
          [beta],
        )
      ).team_setup_completed_at,
      first,
    );
  });
});
test("removed inviter loses outstanding authority; no delayed grant after removal", async () => {
  const token = (
    await as("admin", () =>
      one(
        "select public.create_invitation($1,'unverified@hostflow.test','staff') token",
        [alpha],
      ),
    )
  ).token;
  await as("a", () =>
    db.query("select public.remove_member($1,$2)", [alpha, adminId]),
  );
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    ids.unverified,
  ]);
  await as("unverified", () =>
    assert.rejects(
      db.query("select public.accept_invitation($1)", [token]),
      /invitation_unavailable/,
    ),
  );
});
test("all exposed tables have RLS; public RPCs are invoker; no PUBLIC definer grants", async () => {
  await db.exec("reset role");
  const unsafe = (
    await db.query(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity",
    )
  ).rows;
  assert.deepEqual(unsafe, []);
  assert.equal(
    (
      await one(
        "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef",
      )
    ).n,
    0,
  );
  const grants = (
    await db.query(
      "select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and p.prosecdef and a.grantee=0 and a.privilege_type='EXECUTE'",
    )
  ).rows;
  assert.deepEqual(grants, []);
});
