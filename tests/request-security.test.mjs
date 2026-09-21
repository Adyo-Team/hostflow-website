import { test } from "node:test";
import assert from "node:assert/strict";
import { safeOrigin } from "../lib/hostflow/request-security.ts";
test("CSRF: missing and foreign origins are denied", () => {
  assert.equal(safeOrigin(null, "https://hostflow.test/api/hostflow"), false);
  assert.equal(
    safeOrigin("https://evil.test", "https://hostflow.test/api/hostflow"),
    false,
  );
  assert.equal(
    safeOrigin(
      "https://hostflow.test.evil.test",
      "https://hostflow.test/api/hostflow",
    ),
    false,
  );
  assert.equal(safeOrigin("null", "https://hostflow.test/api/hostflow"), false);
});
test("CSRF: canonical origin wins over an injected request host", () => {
  assert.equal(
    safeOrigin(
      "https://hostflow.test",
      "http://internal/api/hostflow",
      "https://hostflow.test",
    ),
    true,
  );
  assert.equal(
    safeOrigin(
      "https://evil.test",
      "https://evil.test/api/hostflow",
      "https://hostflow.test",
    ),
    false,
  );
  assert.equal(
    safeOrigin("http://hostflow.test", "https://hostflow.test/api/hostflow"),
    false,
  );
});
