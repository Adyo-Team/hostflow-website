// Runs the real Auth/RLS suite against a native Next server and the remote project.
// HOSTFLOW_TEST_ACCOUNTS_FILE is an ignored, private JSON file with three accounts.
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
const origin = "http://localhost:3099";
const input = JSON.parse(
  await readFile(process.env.HOSTFLOW_TEST_ACCOUNTS_FILE, "utf8"),
);
const env = { ...process.env, APP_URL: origin, HOSTFLOW_TEST_ORIGIN: origin };
for (const account of input.accounts) {
  assert.ok(["A", "B", "MEMBER"].includes(account.name));
  env["HOSTFLOW_TEST_" + account.name + "_EMAIL"] = account.email;
  env["HOSTFLOW_TEST_" + account.name + "_PASSWORD"] = account.password;
}
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    "3099",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Next startup timeout")),
      15000,
    );
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("Next server exited: " + code));
    });
  });
  const suite = process.env.HOSTFLOW_TEST_SUITE ?? "foundation";
  assert.ok(["foundation", "properties"].includes(suite));
  const test = spawn(process.execPath, ["tests/live-" + suite + ".mjs"], {
    env,
    stdio: "inherit",
  });
  const code = await new Promise((resolve) => test.once("exit", resolve));
  assert.equal(code, 0, "Live acceptance must pass");
} finally {
  server.kill("SIGTERM");
}
