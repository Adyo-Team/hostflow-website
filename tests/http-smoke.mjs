// Requires pnpm build:next. Exercises the real BFF with an intentionally absent
// backend; never sends credentials or test signup email to Supabase.
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const origin = "http://localhost:3098";
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3098",
  ],
  {
    env: {
      ...process.env,
      SUPABASE_URL: "",
      SUPABASE_PUBLISHABLE_KEY: "",
      APP_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("HTTP test server startup timeout")),
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
      reject(new Error("HTTP test server exited: " + code));
    });
  });
  const response = await fetch(origin + "/api/hostflow");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control"), /no-store/);
  const data = await response.json();
  assert.equal(data.configured, false);
  assert.deepEqual(data.members, []);
  assert.equal(data.user, null);
  async function post(body, headers = {}) {
    return fetch(origin + "/api/hostflow", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });
  }
  assert.equal(
    (await post("{}", { Origin: "https://untrusted.example" })).status,
    403,
  );
  assert.equal((await post("{")).status, 400);
  assert.equal((await post("x".repeat(12001))).status, 413);
  assert.equal(
    (await post("{}", { "Content-Type": "text/plain" })).status,
    415,
  );
  assert.equal(
    (
      await post(
        JSON.stringify({
          action: "signup",
          firstName: "Local",
          lastName: "Test",
          email: "local-test@hostflow.test",
          password: "never-sent-to-a-provider",
        }),
      )
    ).status,
    503,
  );
  assert.equal(
    (
      await post(
        JSON.stringify({
          action: "updateMembership",
          organizationId: "invalid",
          membershipId: "invalid",
          role: "super_admin",
          status: "active",
        }),
      )
    ).status,
    400,
  );
  console.log(
    "7 real HTTP checks passed: no-store empty state, CSRF, malformed JSON, body limit, content type, unavailable backend, invalid role.",
  );
} finally {
  child.kill("SIGTERM");
}
