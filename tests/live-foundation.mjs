// Opt-in acceptance against REAL Supabase Auth and the running HostFlow API.
// Credentials are supplied only through the environment. No fallback/mock mode.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
function required(name) {
  if (!process.env[name])
    throw new Error("Missing " + name + "; live acceptance NOT run.");
  return process.env[name];
}
const origin = new URL(required("HOSTFLOW_TEST_ORIGIN")).origin;
const url = required("SUPABASE_URL"),
  key = required("SUPABASE_PUBLISHABLE_KEY");
if (key.startsWith("sb_secret_"))
  throw new Error("Only a publishable key may be used.");
const accounts = ["A", "B", "MEMBER"].map((name) => ({
  name,
  email: required("HOSTFLOW_TEST_" + name + "_EMAIL"),
  password: required("HOSTFLOW_TEST_" + name + "_PASSWORD"),
}));
assert.equal(
  new Set(accounts.map((a) => a.email.toLowerCase())).size,
  3,
  "Use three different confirmed test addresses",
);
function session() {
  const jar = new Map();
  return {
    jar,
    async request(path = "/api/hostflow", body) {
      const response = await fetch(origin + path, {
        method: body ? "POST" : "GET",
        redirect: "manual",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30000),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(";");
        const equal = pair.indexOf("=");
        const name = pair.slice(0, equal);
        const value = pair.slice(equal + 1);
        if (!value || /max-age=0/i.test(cookie)) jar.delete(name);
        else jar.set(name, value);
      }
      return response;
    },
    async api(body) {
      const response = await this.request("/api/hostflow", body);
      return { status: response.status, data: await response.json() };
    },
  };
}
const [a, b, member] = accounts.map(() => session());
const tag = randomUUID().slice(0, 8);
const clients = [];
try {
  if (process.env.HOSTFLOW_TEST_SIGNUP === "true") {
    for (let i = 0; i < 3; i++) {
      const result = await [a, b, member][i].api({
        action: "signup",
        email: accounts[i].email,
        password: accounts[i].password,
        firstName: accounts[i].name,
        lastName: "Acceptance",
      });
      assert.equal(result.status, 200);
    }
    console.log(
      "Signup requests completed. Confirm the three addresses, then rerun without HOSTFLOW_TEST_SIGNUP.",
    );
  } else {
    for (let i = 0; i < 3; i++) {
      const r = await [a, b, member][i].api({
        action: "login",
        email: accounts[i].email,
        password: accounts[i].password,
      });
      assert.equal(r.status, 200, "Login requires a confirmed test account");
    }
    const personal = (await member.api()).data;
    assert.ok(
      personal.user && personal.profile,
      "Personal account and profile exist before any organization",
    );
    assert.deepEqual(
      personal.memberships,
      [],
      "No organization is required or created for a personal account",
    );
    assert.equal(personal.activeOrganizationId, null);
    assert.equal(
      (await member.request("/welcome")).status,
      200,
      "Personal welcome is accessible",
    );
    assert.equal(
      (await member.request("/settings")).status,
      200,
      "Personal profile is accessible without organization",
    );
    let r = await a.api({
      action: "createOrganization",
      name: "QA Alpha " + tag,
      slug: "qa-alpha-" + tag,
      country: "BE",
      currency: "EUR",
      timezone: "Europe/Brussels",
    });
    assert.equal(r.status, 200);
    const initial = (await a.api()).data;
    const alpha = initial.activeOrganizationId;
    assert.equal(
      initial.memberships.find((m) => m.organization_id === alpha).role,
      "owner",
    );
    r = await a.api({
      action: "createInvitation",
      organizationId: alpha,
      email: accounts[2].email,
      role: "staff",
    });
    assert.equal(r.status, 200);
    const token = new URL(r.data.invitationUrl).searchParams.get("token");
    assert.ok(token);
    r = await member.api({ action: "acceptInvitation", token });
    assert.equal(r.status, 200);
    const joined = (await member.api()).data;
    assert.equal(
      joined.memberships.find((m) => m.organization_id === alpha).role,
      "staff",
    );
    assert.equal(
      joined.memberships.length,
      1,
      "Invited staff joins Alpha without creating another organization",
    );
    const memberId = joined.memberships[0].id;
    assert.equal(
      (
        await member.api({
          action: "createInvitation",
          organizationId: alpha,
          email: accounts[1].email,
          role: "admin",
        })
      ).status,
      403,
    );
    r = await b.api({
      action: "createOrganization",
      name: "QA Beta " + tag,
      slug: "qa-beta-" + tag,
      country: "FR",
      currency: "EUR",
      timezone: "Europe/Paris",
    });
    assert.equal(r.status, 200);
    const beta = (await b.api()).data.activeOrganizationId;
    assert.notEqual(alpha, beta);
    assert.equal(
      (await b.api({ action: "switchOrganization", organizationId: alpha }))
        .status,
      403,
    );
    b.jar.set("hf-organization", alpha);
    assert.equal((await b.api()).data.activeOrganizationId, beta);
    assert.equal(
      (
        await b.api({
          action: "updateOrganization",
          organizationId: alpha,
          name: "Intrusion",
          country: "FR",
          timezone: "Europe/Paris",
          currency: "EUR",
        })
      ).status,
      403,
    );
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    clients.push(client);
    const login = await client.auth.signInWithPassword({
      email: accounts[1].email,
      password: accounts[1].password,
    });
    assert.ifError(login.error);
    for (const table of [
      "organizations",
      "organization_members",
      "organization_memberships",
      "organization_invitations",
      "audit_logs",
    ]) {
      const result = await client
        .from(table)
        .select("id")
        .eq(table === "organizations" ? "id" : "organization_id", alpha);
      assert.ifError(result.error);
      assert.deepEqual(result.data, [], table + " leaks Alpha");
    }
    const roster = await client.rpc("list_team", { p_organization_id: alpha });
    assert.equal(roster.error?.code, "42501");
    const profile = await client
      .from("profiles")
      .select("id")
      .eq("id", initial.user.id);
    assert.ifError(profile.error);
    assert.deepEqual(profile.data, []);
    // Change roles using the owner, then verify permissions on the existing staff session.
    assert.equal(
      (
        await a.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: memberId,
          role: "manager",
          status: "active",
        })
      ).status,
      200,
    );
    assert.equal((await member.api()).data.members.length, 2);
    assert.equal(
      (
        await member.api({
          action: "updateOrganization",
          organizationId: alpha,
          name: "Forbidden",
          country: "BE",
          currency: "EUR",
          timezone: "Europe/Brussels",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: memberId,
          role: "admin",
          status: "active",
        })
      ).status,
      200,
    );
    const ownerId = initial.memberships.find(
      (m) => m.organization_id === alpha,
    ).id;
    assert.equal(
      (
        await member.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: ownerId,
          role: "staff",
          status: "active",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await a.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: ownerId,
          role: "staff",
          status: "active",
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await a.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: memberId,
          role: "staff",
          status: "suspended",
        })
      ).status,
      200,
    );
    assert.deepEqual((await member.api()).data.memberships, []);
    assert.equal(
      (
        await a.api({
          action: "updateMembership",
          organizationId: alpha,
          membershipId: memberId,
          role: "staff",
          status: "active",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await a.api({
          action: "removeMember",
          organizationId: alpha,
          membershipId: memberId,
        })
      ).status,
      200,
    );
    const removed = (await member.api()).data;
    assert.ok(
      removed.user && removed.profile,
      "Removing membership preserves personal account",
    );
    assert.deepEqual(removed.memberships, []);
    assert.equal((await member.request("/welcome")).status, 200);
    assert.equal((await a.api({ action: "logout" })).status, 200);
    assert.equal((await a.api()).data.user, null);
    const denied = await a.request("/team");
    assert.ok([302, 303, 307, 308].includes(denied.status));
    assert.equal(
      (
        await a.api({
          action: "login",
          email: accounts[0].email,
          password: accounts[0].password,
        })
      ).status,
      200,
    );
    assert.equal(
      (await a.api({ action: "switchOrganization", organizationId: alpha }))
        .status,
      200,
    );
    const restored = session();
    for (const [name, value] of a.jar) restored.jar.set(name, value);
    assert.equal((await restored.request("/team")).status, 200);
    assert.equal((await restored.api()).data.activeOrganizationId, alpha);
    console.log(
      "PASS: real sessions, personal account without organization, owner bootstrap, staff invitation without organization creation, owner/admin/manager/staff permissions, suspension/removal, Alpha/Beta RLS, cookie tampering, logout/login, direct private-route restoration.",
    );
    console.log(
      "Test organizations retained: QA Alpha " +
        tag +
        " / QA Beta " +
        tag +
        ". Desktop/mobile browser acceptance remains a separate check.",
    );
  }
} finally {
  for (const s of [a, b, member])
    await s.api({ action: "logout" }).catch(() => {});
  for (const client of clients)
    await client.auth.signOut({ scope: "local" }).catch(() => {});
}
