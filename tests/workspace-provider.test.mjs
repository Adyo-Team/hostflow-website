import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

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
  .outputText.replace(
    'from "react"',
    `from ${JSON.stringify(import.meta.resolve("react"))}`,
  )
  .replace(
    'from "@/lib/hostflow/types"',
    `from ${JSON.stringify(new URL("../lib/hostflow/types.ts", import.meta.url).href)}`,
  );
const { WorkspaceProvider, useWorkspace } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

test("dashboard and Properties consume the same workspace controller", () => {
  const values = [];
  function Page() {
    values.push(useWorkspace());
    return null;
  }
  renderToStaticMarkup(
    createElement(
      WorkspaceProvider,
      null,
      createElement(Page),
      createElement(Page),
    ),
  );
  assert.equal(values.length, 2);
  assert.equal(
    values[0],
    values[1],
    "Navigation must not create separate workspace state or requests",
  );
  assert.equal(values[0].loading, true);
});

test("workspace consumers cannot silently mount an isolated controller", () => {
  function Page() {
    useWorkspace();
    return null;
  }
  assert.throws(
    () => renderToStaticMarkup(createElement(Page)),
    /WorkspaceProvider is required/,
  );
});
