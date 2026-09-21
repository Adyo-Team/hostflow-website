import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../components/hostflow/properties/client.ts", import.meta.url),
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
  );
const { propertyRequest } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);

test("property reads retain a timeout when a component supplies its cancellation signal", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  AbortSignal.timeout = () =>
    AbortSignal.abort(new DOMException("Request timed out", "TimeoutError"));
  globalThis.fetch = async (_url, options) => {
    options.signal.throwIfAborted();
    return Response.json({ ok: true });
  };
  try {
    await assert.rejects(
      propertyRequest("/catalog", "test", {
        signal: new AbortController().signal,
      }),
      { name: "TimeoutError" },
    );
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});

test("changing organization can still cancel an in-flight property read", async () => {
  const originalFetch = globalThis.fetch;
  const controller = new AbortController();
  globalThis.fetch = async (_url, options) => {
    controller.abort();
    options.signal.throwIfAborted();
    return Response.json({ ok: true });
  };
  try {
    await assert.rejects(
      propertyRequest("/catalog", "test", { signal: controller.signal }),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
