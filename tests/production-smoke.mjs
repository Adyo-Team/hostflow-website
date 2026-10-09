// Requires pnpm build. Exercises the production Node launcher with an anonymous
// local Supabase fixture; no real credentials, provider calls or data writes.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const launcher = fileURLToPath(
  new URL("../scripts/run-framework.mjs", import.meta.url),
);
const appUrl = "https://hostflow-railway-staging.example";
let checks = 0;
let fixtureRequests = 0;
const fixture = createServer((_request, response) => {
  fixtureRequests++;
  response.writeHead(401, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ error: "Anonymous local fixture only" }));
});

async function listen(server, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, resolve);
  });
  return server.address().port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

function start(environment) {
  const child = spawn(process.execPath, [launcher, "start"], {
    cwd: projectRoot,
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
  return { child, exited, output: () => output };
}

async function stop(server) {
  if (server.child.exitCode !== null) return;
  server.child.kill("SIGTERM");
  const timeout = setTimeout(() => server.child.kill("SIGKILL"), 5000);
  try {
    await server.exited;
  } finally {
    clearTimeout(timeout);
  }
}

async function ready(server) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => finish(new Error("Production startup timeout\n" + server.output())),
      30000,
    );
    const interval = setInterval(() => {
      if (server.output().includes("Ready")) finish();
    }, 50);
    function finish(error) {
      clearTimeout(timer);
      clearInterval(interval);
      error ? reject(error) : resolve();
    }
    server.exited.then(
      (code) =>
        finish(
          new Error(
            "Production server exited: " + code + "\n" + server.output(),
          ),
        ),
      finish,
    );
  });
}

await access(new URL("../.next/BUILD_ID", import.meta.url)).catch(() => {
  throw new Error(
    "A production Next.js build is required. Run pnpm build first.",
  );
});

const fixturePort = await listen(fixture);
const portProbe = createServer();
const port = await listen(portProbe, "0.0.0.0");
await close(portProbe);
const origin = "http://127.0.0.1:" + port;
const environment = {
  NODE_ENV: "production",
  PORT: String(port),
  SUPABASE_URL: "http://127.0.0.1:" + fixturePort,
  SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_anonymous_fixture",
  APP_URL: appUrl,
};
let server;
try {
  for (const invalidPort of ["0", "65536", "invalid"]) {
    const invalid = start({ ...environment, PORT: invalidPort });
    const timeout = setTimeout(() => invalid.child.kill("SIGKILL"), 10000);
    try {
      assert.notEqual(await invalid.exited, 0);
      assert.match(
        invalid.output(),
        /PORT must be an integer between 1 and 65535/,
      );
      checks++;
    } finally {
      clearTimeout(timeout);
    }
  }

  server = start(environment);
  await ready(server);
  assert.ok(
    server.output().includes("http://0.0.0.0:" + port),
    "Launcher must advertise 0.0.0.0 and injected PORT",
  );
  checks++;
  const request = (path, options = {}) =>
    fetch(origin + path, {
      ...options,
      redirect: "manual",
      signal: AbortSignal.timeout(10000),
    });
  const noStore = (response) => {
    assert.match(response.headers.get("cache-control"), /no-store/);
  };

  let loginHtml;
  for (const path of ["/login", "/signup", "/forgot-password", "/invite"]) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    if (path === "/login") loginHtml = html;
    checks++;
  }
  const script = loginHtml.match(/src="([^" ]*\/_next\/static\/[^" ]+\.js)"/);
  assert.ok(script, "Login must load the production frontend JavaScript");
  const asset = await request(script[1]);
  assert.equal(asset.status, 200);
  await asset.arrayBuffer();
  checks++;

  const forwarded = await request("/login", {
    headers: {
      Host: new URL(appUrl).host,
      "X-Forwarded-Host": new URL(appUrl).host,
      "X-Forwarded-Proto": "https",
    },
  });
  assert.equal(forwarded.status, 200, "Railway forwarded HTTPS request");
  await forwarded.text();
  checks++;

  for (const path of [
    "/",
    "/team",
    "/calendar",
    "/properties",
    "/reservations",
  ]) {
    const response = await request(path);
    assert.equal(response.status, 307, path);
    assert.equal(response.headers.get("location"), appUrl + "/login");
    noStore(response);
    await response.text();
    checks++;
  }

  const workspace = await request("/api/hostflow");
  assert.equal(workspace.status, 200);
  noStore(workspace);
  const state = await workspace.json();
  assert.equal(state.configured, true);
  assert.equal(state.user, null);
  assert.deepEqual(state.members, []);
  checks++;
  for (const path of ["/api/properties", "/api/reservations", "/api/tasks"]) {
    const response = await request(path);
    assert.equal(response.status, 401, path);
    noStore(response);
    assert.equal(typeof (await response.json()).error, "string");
    checks++;
  }

  for (const path of [
    "/api/hostflow",
    "/api/properties",
    "/api/reservations",
    "/api/tasks",
  ]) {
    const body =
      path === "/api/hostflow"
        ? {
            action: "updateProfile",
            firstName: "Local",
            lastName: "Fixture",
            phone: "",
          }
        : {};
    for (const suppliedOrigin of [null, "https://foreign.example", appUrl]) {
      const response = await request(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(suppliedOrigin ? { Origin: suppliedOrigin } : {}),
        },
        body: JSON.stringify(body),
      });
      assert.equal(
        response.status,
        suppliedOrigin === appUrl ? 401 : 403,
        path + " origin " + suppliedOrigin,
      );
      noStore(response);
      await response.json();
      checks++;
    }
  }

  const insecureOrigin = await request("/api/hostflow", {
    method: "POST",
    headers: {
      Origin: appUrl.replace("https:", "http:"),
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  assert.equal(insecureOrigin.status, 403);
  await insecureOrigin.json();
  checks++;

  const callback = await request(
    "/auth/confirm?next=https%3A%2F%2Fforeign.example",
  );
  assert.equal(callback.status, 307);
  assert.equal(
    callback.headers.get("location"),
    appUrl + "/login?error=confirmation",
  );
  assert.equal(callback.headers.get("referrer-policy"), "no-referrer");
  noStore(callback);
  await callback.text();
  checks++;
  assert.equal(
    fixtureRequests,
    0,
    "Anonymous checks must not access provider data or credentials",
  );
  assert.doesNotMatch(server.output(), /TypeError|ReferenceError|SyntaxError/);
  console.log(
    "PASS: " +
      checks +
      " production HTTP checks; PORT=" +
      port +
      ", 0.0.0.0, HTTPS canonical origin, frontend asset, anonymous Auth/API guards and CSRF. Local anonymous fixture only: real Supabase sessions, email and Storage are not validated.",
  );
} finally {
  if (server) await stop(server);
  await close(fixture);
}
