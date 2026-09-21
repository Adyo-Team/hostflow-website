import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
const url = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const hooks = url(`
export const resource = {key:"alpha|?search=old",organizationId:"alpha",revision:0,data:{cities:["Bruxelles"]},error:""};
export const useState = value => [typeof value === "number" ? value : resource, () => {}];
export const useEffect = () => {};
export const useCallback = callback => callback;
`);
const source = await readFile(new URL("../components/hostflow/properties/client.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace('from "react"',`from ${JSON.stringify(hooks)}`);
const {usePropertyResource} = await import(url(js));
test("a search keeps city choices without presenting the old results as current", () => {
  const state = usePropertyResource("?search=new", "alpha");
  assert.equal(state.loading, true);
  assert.equal(state.data, null);
  assert.deepEqual(state.previousData.cities, ["Bruxelles"]);
});
test("an organization change exposes neither current nor previous tenant data", () => {
  const state = usePropertyResource("?search=new", "beta");
  assert.equal(state.data, null);
  assert.equal(state.previousData, null);
  assert.equal(state.loading, true);
});
