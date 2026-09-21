import test from "node:test";
import assert from "node:assert/strict";
import { propertyId } from "../lib/properties/id.ts";
test("property ids remain secure UUIDv4 in a local HTTP context without randomUUID", () => {
  const original = globalThis.crypto;
  let called = false;
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: {
      getRandomValues(bytes) {
        called = true;
        return original.getRandomValues(bytes);
      },
    },
  });
  try {
    const a = propertyId(),
      b = propertyId();
    assert.ok(called);
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    assert.notEqual(a, b);
  } finally {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: original,
    });
  }
});
