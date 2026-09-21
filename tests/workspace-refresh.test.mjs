import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

// Isolate the workspace hook's async transitions without a browser or session.
// The hook bodies and fetch handling are the production code.
const moduleUrl = (js) =>
  "data:text/javascript;base64," + Buffer.from(js).toString("base64");
const hooksUrl = moduleUrl(`
export const slots = [];
export const createContext = () => ({});
export const createElement = () => null;
export const useContext = () => null;
export const useState = initial => { const index = slots.push(initial) - 1; return [initial, value => { slots[index] = value; }]; };
export const useRef = current => ({current});
export const useCallback = fn => fn;
export const useEffect = () => {};
`);
const source = await readFile(
  new URL("../components/hostflow/client.ts", import.meta.url),
  "utf8",
);
const js = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace('from "react"', `from ${JSON.stringify(hooksUrl)}`)
  .replace(
    'from "@/lib/hostflow/types"',
    `from ${JSON.stringify(new URL("../lib/hostflow/types.ts", import.meta.url).href)}`,
  );
const { useWorkspaceController } = await import(moduleUrl(js));
const { slots } = await import(hooksUrl);

test("a failed background refresh preserves the workspace, but a confirmed logout clears it", async () => {
  const originalFetch = globalThis.fetch;
  const workspace = {
    configured: true,
    user: { id: "qa" },
    memberships: [{ organization_id: "alpha" }],
    activeOrganizationId: "alpha",
  };
  const hook = useWorkspaceController();
  try {
    globalThis.fetch = async () => Response.json(workspace);
    await hook.reload();
    assert.deepEqual(slots[0], workspace);
    globalThis.fetch = async () =>
      Response.json({ error: "Temporary database failure" }, { status: 500 });
    await assert.rejects(hook.reload(), /Temporary database failure/);
    assert.deepEqual(
      slots[0],
      workspace,
      "The form must retain its organization and mounted workspace",
    );
    assert.equal(slots[2], "Temporary database failure");
    globalThis.fetch = async () =>
      Response.json({
        configured: true,
        user: null,
        memberships: [],
        activeOrganizationId: null,
      });
    await hook.reload();
    assert.equal(slots[0].user, null);
    assert.deepEqual(slots[0].memberships, []);
    assert.equal(slots[2], "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
