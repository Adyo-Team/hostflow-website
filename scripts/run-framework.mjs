import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./execution-profile.mjs";

const [command, ...args] = process.argv.slice(2);
if (!["dev", "build"].includes(command))
  throw new Error("Expected dev or build.");
const managedLinux = readExecutionProfile() === "managed-linux";
// Keep quality checks in the existing build workflow, for both execution profiles.
if (command === "build") {
  const pnpmPath = process.env.npm_execpath;
  if (!pnpmPath || !process.env.npm_config_user_agent?.startsWith("pnpm/"))
    throw new Error("Run the build with pnpm build.");
  for (const script of ["typecheck", "test"]) {
    // Reuse pnpm's entrypoint without relying on Windows shell shims.
    const result = spawnSync(process.execPath, [pnpmPath, "run", script], {
      stdio: "inherit",
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
  }
}

if (managedLinux && command === "build") {
  const result = spawnSync(
    "bash",
    [fileURLToPath(new URL("./build-verified.sh", import.meta.url)), ...args],
    { stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}

// Import in this process so the preview owner retains its PID and signals.
const cli = new URL(
  managedLinux
    ? "../node_modules/vite/bin/vite.js"
    : "../node_modules/vinext/dist/cli.js",
  import.meta.url,
);
process.argv = [
  process.execPath,
  fileURLToPath(cli),
  command,
  ...(!managedLinux && command === "dev" ? ["--port", "5173"] : []),
  ...args,
];
await import(cli.href);
