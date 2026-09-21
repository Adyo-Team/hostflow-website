// Real Supabase connectivity and anonymous-route checks. Sends no signup email.
// Requires a native Next build and the project's publishable environment variables.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
const origin = "http://localhost:3099";
const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(
  url && key?.startsWith("sb_publishable_"),
  "Real Supabase publishable configuration required",
);
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3099",
  ],
  {
    env: { ...process.env, APP_URL: origin },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let diagnostics = "";
child.stderr.on("data", (chunk) => {
  diagnostics += chunk.toString();
});
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Test server startup timeout")),
      15000,
    );
    child.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Test server exited: " + code));
    });
  });
  const api = async (body) =>
    fetch(origin + "/api/hostflow", {
      method: body ? "POST" : "GET",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
  const workspace = await api();
  assert.equal(workspace.status, 200);
  assert.match(workspace.headers.get("cache-control"), /no-store/);
  const empty = await workspace.json();
  assert.equal(empty.configured, true);
  assert.equal(empty.user, null);
  assert.deepEqual(empty.members, []);
  const privatePage = await fetch(origin + "/team", { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(privatePage.status));
  assert.equal(
    new URL(privatePage.headers.get("location"), origin).pathname,
    "/login",
  );
  for (const path of ["/login", "/signup"])
    assert.equal((await fetch(origin + path)).status, 200);
  const denied = await api({
    action: "createOrganization",
    name: "Forbidden",
    slug: "forbidden-" + randomUUID(),
    country: "BE",
    currency: "EUR",
    timezone: "Europe/Brussels",
  });
  assert.equal(denied.status, 401);
  const badLogin = await api({
    action: "login",
    email: "nonexistent-" + randomUUID() + "@example.test",
    password: "invalid-test-credentials",
  });
  assert.equal(
    badLogin.status,
    401,
    "Supabase Auth must reject incorrect credentials",
  );
  const settings = await fetch(url + "/auth/v1/settings", {
    headers: { apikey: key },
  });
  assert.equal(settings.status, 200);
  assert.equal((await settings.json()).external.email, true);
  for (const path of [
    "/rest/v1/organizations?select=id",
    "/rest/v1/rpc/list_team",
  ]) {
    const rpc = path.includes("/rpc/");
    const response = await fetch(url + path, {
      method: rpc ? "POST" : "GET",
      headers: { apikey: key, "Content-Type": "application/json" },
      body: rpc
        ? JSON.stringify({ p_organization_id: randomUUID() })
        : undefined,
    });
    assert.ok([401, 403].includes(response.status));
    assert.equal((await response.json()).code, "42501");
  }
  assert.doesNotMatch(diagnostics, /TypeError|ReferenceError|SyntaxError/);
  console.log(
    "PASS: connected BFF, no-store empty workspace, private-route redirect, login/signup pages, unauthenticated mutation denial, real Auth invalid-credential denial, Auth settings and anonymous REST/RPC denial. Successful sessions not covered.",
  );
} finally {
  child.kill("SIGTERM");
}
