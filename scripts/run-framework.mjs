import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build", "start"].includes(command))
  throw new Error("Expected dev, build or start.");
// Keep the existing quality gate before compiling for production.
if (command === "build") {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath || !process.env.npm_config_user_agent?.startsWith("pnpm/"))
    throw new Error("Run the build with pnpm build.");
  // Corepack uses a JS entrypoint; Railpack/Mise installs a native executable.
  const nodeEntrypoint = /\.(?:c?js|mjs)$/i.test(pnpmPath);
  for (const script of ["typecheck", "test"]) {
    // Reuse the running pnpm without relying on Windows shell shims.
    const result = spawnSync(
      nodeEntrypoint ? process.execPath : pnpmPath,
      [...(nodeEntrypoint ? [pnpmPath] : []), "run", script],
      { stdio: "inherit" },
    );
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

// Use Next's own Node server in this process to preserve shutdown signals.
const cli = new URL("../node_modules/next/dist/bin/next", import.meta.url);
const port = process.env.PORT || "3000";
if (
  command === "start" &&
  (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
)
  throw new Error("PORT must be an integer between 1 and 65535.");
process.argv = [
  process.execPath,
  fileURLToPath(cli),
  command,
  ...(command === "start" ? ["--hostname", "0.0.0.0", "--port", port] : []),
  ...args,
];
await import(cli.href);
