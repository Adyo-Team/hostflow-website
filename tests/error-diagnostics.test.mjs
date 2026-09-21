import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const source = await readFile(
  new URL("../lib/hostflow/errors.ts", import.meta.url),
  "utf8",
);
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const { checkDb } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
test("unexpected database failures identify the operation without leaking values", () => {
  const original = console.error;
  const logs = [];
  console.error = (...args) => logs.push(args);
  try {
    assert.throws(
      () =>
        checkDb(
          { code: "08006", message: "private-value" },
          "workspace.profile",
        ),
      { status: 500 },
    );
    assert.deepEqual(logs[0], [
      "HostFlow database request failed",
      { operation: "workspace.profile", code: "08006" },
    ]);
    assert.ok(!JSON.stringify(logs).includes("private-value"));
  } finally {
    console.error = original;
  }
});
