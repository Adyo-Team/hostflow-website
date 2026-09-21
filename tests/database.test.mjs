import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
// Real PostgreSQL engine + real pgcrypto. Only the Supabase Auth schema/uid contract
// is bootstrapped locally; never points to a deployed project or sends email.
let db, orgA, orgB, adminA, staffId, managerId, inviteToken;
const users = {
  a: "10000000-0000-4000-8000-000000000001",
  b: "10000000-0000-4000-8000-000000000002",
  staff: "10000000-0000-4000-8000-000000000003",
  manager: "10000000-0000-4000-8000-000000000004",
  owner: "10000000-0000-4000-8000-000000000005",
  guest: "10000000-0000-4000-8000-000000000006",
  invite: "10000000-0000-4000-8000-000000000007",
  unverified: "10000000-0000-4000-8000-000000000008",
};
async function asUser(id, fn) {
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    id ?? "",
  ]);
  await db.exec(id ? "set role authenticated" : "set role anon");
  return fn();
}
async function one(sql, args = []) {
  return (await db.query(sql, args)).rows[0];
}
before(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.waitReady;
  await db.exec(
    "create role anon nologin; create role authenticated nologin; create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;",
  );
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260914003227_foundations.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(migration);
  for (const [name, id] of Object.entries(users))
    await db.query("insert into auth.users values ($1,$2,$3)", [
      id,
      name + "@hostflow.test",
      name === "unverified" ? null : new Date().toISOString(),
    ]);
  orgA = (
    await asUser(users.a, () =>
      one(
        "select public.create_organization('Alpha','alpha','Europe/Brussels','EUR','Alice') as id",
      ),
    )
  ).id;
  orgB = (
    await asUser(users.b, () =>
      one(
        "select public.create_organization('Beta','beta','Europe/Paris','EUR','Bob') as id",
      ),
    )
  ).id;
  await db.exec("reset role");
  for (const role of ["staff", "manager", "property_owner", "guest"]) {
    const user = role === "property_owner" ? "owner" : role;
    await db.query(
      "insert into public.organization_memberships(organization_id,user_id,display_name,role,created_by) values($1,$2,$3,$4,$5)",
      [orgA, users[user], user, role, users.a],
    );
  }
  adminA = (
    await one(
      "select id from public.organization_memberships where user_id=$1",
      [users.a],
    )
  ).id;
  staffId = (
    await one(
      "select id from public.organization_memberships where user_id=$1",
      [users.staff],
    )
  ).id;
  managerId = (
    await one(
      "select id from public.organization_memberships where user_id=$1",
      [users.manager],
    )
  ).id;
});
after(async () => {
  await db?.close();
});
test("bootstrap creates exactly one active admin with an audit trail", async () => {
  await asUser(users.a, async () => {
    const row = await one(
      "select count(*)::int n from public.organization_memberships where organization_id=$1 and role=$2",
      [orgA, "organization_admin"],
    );
    assert.equal(row.n, 1);
    assert.ok(
      (await one("select count(*)::int n from public.audit_logs")).n >= 2,
    );
  });
});
test("tenant A cannot read tenant B organization, members, audit or invitations", async () => {
  await asUser(users.a, async () => {
    for (const table of [
      "organizations",
      "organization_memberships",
      "audit_logs",
      "organization_invitations",
    ]) {
      const idColumn = table === "organizations" ? "id" : "organization_id";
      assert.equal(
        (
          await one(
            `select count(*)::int n from public.${table} where ${idColumn}=$1`,
            [orgB],
          )
        ).n,
        0,
      );
    }
  });
});
test("tenant A cannot update tenant B through a definer RPC", async () => {
  await asUser(users.a, async () => {
    await assert.rejects(
      db.query(
        "select public.update_organization($1,'Intrusion','Europe/Paris','EUR')",
        [orgB],
      ),
      /forbidden/,
    );
  });
});
test("tenant A cannot target a member in tenant B with its own organization id", async () => {
  await db.exec("reset role");
  const memberB = (
    await one(
      "select id from public.organization_memberships where user_id=$1",
      [users.b],
    )
  ).id;
  await asUser(users.a, () =>
    assert.rejects(
      db.query("select public.update_membership($1,$2,'guest','active')", [
        orgA,
        memberB,
      ]),
      /member_not_found/,
    ),
  );
});
test("anonymous identity has no table reads or RPC execution", async () => {
  await asUser(null, async () => {
    await assert.rejects(
      db.query("select * from public.organizations"),
      /permission denied/,
    );
    await assert.rejects(
      db.query(
        "select public.create_organization('Bad','bad','Europe/Paris','EUR','Anon')",
      ),
      /permission denied/,
    );
  });
});
test("unverified user cannot create an organization", async () => {
  await asUser(users.unverified, () =>
    assert.rejects(
      db.query(
        "select public.create_organization('Test','test-unverified','Europe/Paris','EUR','User')",
      ),
      /verified_user_required/,
    ),
  );
});
test("direct writes and role escalation are denied even for admins", async () => {
  await asUser(users.a, async () => {
    await assert.rejects(
      db.query(
        "update public.organization_memberships set role='guest' where id=$1",
        [adminA],
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.query("delete from public.audit_logs"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("insert into private.platform_admins(user_id) values($1)", [
        users.a,
      ]),
      /permission denied/,
    );
  });
});
test("staff, owner and guest see only their own member record and no audit", async () => {
  for (const user of ["staff", "owner", "guest"])
    await asUser(users[user], async () => {
      const rows = (
        await db.query("select user_id from public.organization_memberships")
      ).rows;
      assert.deepEqual(rows, [{ user_id: users[user] }]);
      assert.equal(
        (await one("select count(*)::int n from public.audit_logs")).n,
        0,
      );
      await assert.rejects(
        db.query(
          "select public.create_invitation($1,'x@hostflow.test','staff')",
          [orgA],
        ),
        /forbidden/,
      );
    });
});
test("manager sees the tenant team but cannot edit roles or view audit", async () => {
  await asUser(users.manager, async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organization_memberships"))
        .n,
      5,
    );
    assert.equal(
      (await one("select count(*)::int n from public.audit_logs")).n,
      0,
    );
    await assert.rejects(
      db.query(
        "select public.update_membership($1,$2,'organization_admin','active')",
        [orgA, managerId],
      ),
      /forbidden/,
    );
  });
});
test("last admin cannot be demoted or suspended", async () => {
  await asUser(users.a, async () => {
    await assert.rejects(
      db.query("select public.update_membership($1,$2,'manager','active')", [
        orgA,
        adminA,
      ]),
      /last_admin_required/,
    );
    await assert.rejects(
      db.query(
        "select public.update_membership($1,$2,'organization_admin','suspended')",
        [orgA, adminA],
      ),
      /last_admin_required/,
    );
  });
});
test("member can edit its tenant display name but not another tenant", async () => {
  await asUser(users.staff, async () => {
    await db.query("select public.update_my_profile($1,'New Staff')", [orgA]);
    assert.equal(
      (await one("select display_name from public.organization_memberships"))
        .display_name,
      "New Staff",
    );
    await assert.rejects(
      db.query("select public.update_my_profile($1,'Intrusion')", [orgB]),
      /forbidden/,
    );
  });
});
test("invitation returns a cryptographic token, never stores it in plaintext or audit", async () => {
  inviteToken = (
    await asUser(users.a, () =>
      one(
        "select public.create_invitation($1,'invite@hostflow.test','staff') token",
        [orgA],
      ),
    )
  ).token;
  assert.match(inviteToken, /^[a-f0-9]{64}$/);
  await db.exec("reset role");
  const row = await one(
    "select token_hash from public.organization_invitations",
  );
  assert.notEqual(row.token_hash, inviteToken);
  assert.equal(
    (
      await one(
        "select count(*)::int n from public.audit_logs where metadata::text like $1",
        ["%" + inviteToken + "%"],
      )
    ).n,
    0,
  );
});
test("even admin cannot read invitation token hashes through granted table access", async () => {
  await asUser(users.a, () =>
    assert.rejects(
      db.query("select token_hash from public.organization_invitations"),
      /permission denied/,
    ),
  );
});
test("wrong email and anonymous users cannot redeem an invitation", async () => {
  await asUser(users.b, () =>
    assert.rejects(
      db.query("select public.accept_invitation($1,'Bob')", [inviteToken]),
      /invitation_unavailable/,
    ),
  );
  await asUser(null, () =>
    assert.rejects(
      db.query("select public.accept_invitation($1,'Anon')", [inviteToken]),
      /permission denied/,
    ),
  );
});
test("verified matching user can accept once with exactly the invited role", async () => {
  await asUser(users.invite, async () => {
    assert.equal(
      (
        await one("select public.accept_invitation($1,'Invited') id", [
          inviteToken,
        ])
      ).id,
      orgA,
    );
    assert.equal(
      (await one("select role from public.organization_memberships")).role,
      "staff",
    );
    await assert.rejects(
      db.query("select public.accept_invitation($1,'Invited')", [inviteToken]),
      /invitation_unavailable/,
    );
  });
});
test("suspension immediately removes all tenant access from a live JWT identity", async () => {
  await asUser(users.a, () =>
    db.query("select public.update_membership($1,$2,'staff','suspended')", [
      orgA,
      staffId,
    ]),
  );
  await asUser(users.staff, async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organizations")).n,
      0,
    );
    assert.equal(
      (await one("select count(*)::int n from public.organization_memberships"))
        .n,
      0,
    );
    await assert.rejects(
      db.query("select public.update_my_profile($1,'No access')", [orgA]),
      /forbidden/,
    );
  });
});
test("platform admin registry never bypasses tenant policies", async () => {
  await db.exec("reset role");
  await db.query("insert into private.platform_admins values ($1,now())", [
    users.b,
  ]);
  await asUser(users.b, async () => {
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.organizations where id=$1",
          [orgA],
        )
      ).n,
      0,
    );
    await assert.rejects(
      db.query(
        "select public.update_organization($1,'Support takeover','Europe/Paris','EUR')",
        [orgA],
      ),
      /forbidden/,
    );
  });
});
test("organization creation rolls back entirely when the first membership is invalid", async () => {
  await asUser(users.a, async () => {
    await assert.rejects(
      db.query(
        "select public.create_organization('Rollback','rollback','Europe/Paris','EUR','')",
      ),
      /check constraint/,
    );
    assert.equal(
      (
        await one(
          "select count(*)::int n from public.organizations where slug='rollback'",
        )
      ).n,
      0,
    );
  });
});

test("one identity can hold different roles in different organizations", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into public.organization_memberships(organization_id,user_id,display_name,role,created_by) values($1,$2,'Alice chez Beta','guest',$3)",
    [orgB, users.a, users.b],
  );
  await asUser(users.a, async () => {
    assert.equal(
      (await one("select count(*)::int n from public.organizations")).n,
      2,
    );
    await assert.rejects(
      db.query(
        "select public.update_organization($1,'Wrong role','Europe/Paris','EUR')",
        [orgB],
      ),
      /forbidden/,
    );
  });
});
test("revoked and expired invitations cannot be redeemed", async () => {
  let token = (
    await asUser(users.a, () =>
      one(
        "select public.create_invitation($1,'unverified@hostflow.test','guest') token",
        [orgA],
      ),
    )
  ).token;
  await db.exec("reset role");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    users.unverified,
  ]);
  const invitation = (
    await one(
      "select id from public.organization_invitations where email='unverified@hostflow.test'",
    )
  ).id;
  await asUser(users.a, () =>
    db.query("select public.revoke_invitation($1,$2)", [orgA, invitation]),
  );
  await asUser(users.unverified, () =>
    assert.rejects(
      db.query("select public.accept_invitation($1,'User')", [token]),
      /invitation_unavailable/,
    ),
  );
  token = (
    await asUser(users.a, () =>
      one(
        "select public.create_invitation($1,'unverified@hostflow.test','guest') token",
        [orgA],
      ),
    )
  ).token;
  await db.exec("reset role");
  await db.exec(
    "update public.organization_invitations set expires_at=now()-interval '1 minute' where email='unverified@hostflow.test' and revoked_at is null",
  );
  await asUser(users.unverified, () =>
    assert.rejects(
      db.query("select public.accept_invitation($1,'User')", [token]),
      /invitation_unavailable/,
    ),
  );
});
