import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";
async function load(path, imports) {
  let code = ts.transpileModule(
    await readFile(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  for (const name of imports)
    code = code.replaceAll(
      `from "${name}"`,
      `from ${JSON.stringify(import.meta.resolve(name))}`,
    );
  return import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
}
const { reservationInput, blockInput } = await load(
  "../lib/reservations/validation.ts",
  ["zod"],
);
const { stayRequest } = await load(
  "../components/hostflow/reservations/client.ts",
  ["react"],
);
const sample = {
  id: "10000000-0000-4000-8000-000000000001",
  property_id: "10000000-0000-4000-8000-000000000002",
  check_in: "2030-09-10",
  check_out: "2030-09-15",
  status: "confirmed",
  source: "manual",
  guest_name: "QA",
  guests_count: 1,
  version: null,
};
test("network and non-JSON failures give actionable French messages", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch");
    };
    await assert.rejects(stayRequest("", "tenant"), /Connexion interrompue/);
    globalThis.fetch = async () =>
      new Response("<html>Bad gateway</html>", { status: 502 });
    await assert.rejects(stayRequest("", "tenant"), /réponse du serveur/);
  } finally {
    globalThis.fetch = original;
  }
});
test("form validates civil dates, nonempty intervals and optional contact fields", () => {
  assert.ok(reservationInput.safeParse(sample).success);
  for (const fields of [
    { check_in: "2030-02-30" },
    { check_out: sample.check_in },
    { check_out: "2030-09-09" },
    { guest_email: "wrong" },
    { guest_name: "   " },
    { guests_count: 0 },
    { source: "airbnb" },
    { organization_id: sample.id },
  ])
    assert.equal(
      reservationInput.safeParse({ ...sample, ...fields }).success,
      false,
    );
  assert.equal(
    reservationInput.parse({ ...sample, guest_email: "" }).guest_email,
    null,
  );
});
test("block form refuses reversed intervals and invalid reasons", () => {
  const b = {
    id: sample.id,
    property_id: sample.property_id,
    start_date: sample.check_in,
    end_date: sample.check_out,
    reason: "owner",
    active: true,
    version: null,
  };
  assert.ok(blockInput.safeParse(b).success);
  assert.equal(
    blockInput.safeParse({ ...b, end_date: b.start_date }).success,
    false,
  );
  assert.equal(
    blockInput.safeParse({ ...b, reason: "unknown" }).success,
    false,
  );
});
test("client preserves active tenant query and no-store on requests", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(
        new URL(url, "https://test").searchParams.get("organization_id"),
        "tenant-current",
      );
      assert.equal(options.cache, "no-store");
      return Response.json({ ok: true });
    };
    assert.deepEqual(
      await stayRequest(
        "?status=confirmed&organization_id=old",
        "tenant-current",
      ),
      { ok: true },
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("backend availability error is surfaced to the form without false success", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json(
        { error: "Ce logement est indisponible." },
        { status: 409 },
      );
    await assert.rejects(
      stayRequest("", "tenant", { method: "POST", body: sample }),
      /indisponible/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("organization switch aborts an in-flight read", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  try {
    globalThis.fetch = async (_, options) => {
      controller.abort();
      options.signal.throwIfAborted();
      return Response.json({});
    };
    await assert.rejects(
      stayRequest("", "tenant", { signal: controller.signal }),
      { name: "AbortError" },
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("client timeout still applies when a caller supplies a signal", async () => {
  const original = globalThis.fetch,
    timeout = AbortSignal.timeout;
  try {
    AbortSignal.timeout = () =>
      AbortSignal.abort(new DOMException("Timed out", "TimeoutError"));
    globalThis.fetch = async (_, options) => {
      options.signal.throwIfAborted();
      return Response.json({});
    };
    await assert.rejects(
      stayRequest("", "tenant", { signal: new AbortController().signal }),
      { name: "TimeoutError" },
    );
  } finally {
    globalThis.fetch = original;
    AbortSignal.timeout = timeout;
  }
});
