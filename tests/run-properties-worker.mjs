import { spawn } from "node:child_process";
import assert from "node:assert/strict";
const origin = "http://localhost:3999";
const env = { ...process.env, HOSTFLOW_TEST_ORIGIN: origin };
const server = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/sites-env.mjs",
    "./node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--config",
    "dist/server/wrangler.json",
    "--env-file",
    process.env.HOSTFLOW_TEST_ENV_FILE ?? ".env.local",
    "--var",
    "SUPABASE_URL:" + process.env.SUPABASE_URL,
    "--var",
    "SUPABASE_PUBLISHABLE_KEY:" + process.env.SUPABASE_PUBLISHABLE_KEY,
    "--var",
    "APP_URL:" + origin,
    "--local",
    "--ip",
    "127.0.0.1",
    "--port",
    "3999",
    "--inspector-port",
    "0",
  ],
  { env, stdio: ["ignore", "pipe", "pipe"] },
);
try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Worker startup timeout")),
      45000,
    );
    server.stdout.on("data", (chunk) => {
      if (chunk.toString().includes("Ready on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error("Worker exited " + code));
    });
  });
  const test = spawn(process.execPath, ["tests/live-properties-worker.mjs"], {
    env,
    stdio: "inherit",
  });
  assert.equal(await new Promise((resolve) => test.once("exit", resolve)), 0);
} finally {
  server.kill("SIGTERM");
}
