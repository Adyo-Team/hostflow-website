import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import ts from "typescript";

// Regression for the published Link crash: the dynamic navigation import
// returned a chunk whose public export names had been removed by the build.
const directory = new URL(
  "../dist/client/_next/static/chunks/",
  import.meta.url,
);
const modules = await Promise.all(
  (await readdir(directory))
    .filter((name) => name.endsWith(".js"))
    .map(async (name) => ({
      name,
      source: await readFile(new URL(name, directory), "utf8"),
    })),
);
const exportsByName = new Map(
  modules.map(({ name, source }) => {
    const ast = ts.createSourceFile(
      name,
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    );
    const names = new Set();
    for (const statement of ast.statements) {
      if (
        ts.isExportDeclaration(statement) &&
        statement.exportClause &&
        ts.isNamedExports(statement.exportClause)
      )
        for (const entry of statement.exportClause.elements)
          names.add(entry.name.text);
    }
    return [name, names];
  }),
);
const callers = modules.filter((m) =>
  /\{\s*navigateClientSide\s*[:}]/.test(m.source),
);
assert.ok(callers.length, "The compiled Link navigation call must be present");
for (const caller of callers) {
  const imports = [
    ...caller.source.matchAll(/import\(["'`]\.\/([^"'`]+)["'`]\)/g),
  ].map((m) => m[1]);
  assert.ok(
    imports.some((name) => exportsByName.get(name)?.has("navigateClientSide")),
    `${caller.name}: Link's dynamic navigation import must expose navigateClientSide`,
  );
}
console.log("Published-bundle navigation contract passed");
