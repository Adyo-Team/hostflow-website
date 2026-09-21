// Smoke test the packaged Worker using real Auth, RLS, multipart and private bytes.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const input = JSON.parse(
  await readFile(process.env.HOSTFLOW_TEST_ACCOUNTS_FILE, "utf8"),
);
const origin = process.env.HOSTFLOW_TEST_ORIGIN;
assert.ok(origin);
const jar = new Map();
async function request(path, method = "GET", body, status = 200) {
  const r = await fetch(origin + path, {
    method,
    redirect: "manual",
    headers: {
      Origin: origin,
      Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
      ...(body && !(body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
    },
    body: body
      ? body instanceof FormData
        ? body
        : JSON.stringify(body)
      : undefined,
    signal: AbortSignal.timeout(90000),
  });
  for (const c of r.headers.getSetCookie()) {
    const p = c.split(";")[0],
      i = p.indexOf("=");
    if (!p.slice(i + 1) || /max-age=0/i.test(c)) jar.delete(p.slice(0, i));
    else jar.set(p.slice(0, i), p.slice(i + 1));
  }
  if (r.status !== status) {
    const data = await r
      .clone()
      .json()
      .catch(() => ({}));
    console.log("Worker error", r.status, data.error);
  }
  assert.equal(r.status, status, path + " unexpected status");
  return r;
}
const a = input.accounts.find((a) => a.name === "A"),
  org = input.organizations[0];
const q = "?organization_id=" + org;
try {
  await request("/api/hostflow", "POST", {
    action: "login",
    email: a.email,
    password: a.password,
  });
  console.log("PASS Worker: real login");
  const workspace = await (await request("/api/hostflow")).json();
  assert.equal(workspace.user.id, a.id);
  assert.equal(workspace.profile.id, a.id);
  assert.equal(workspace.activeOrganizationId, org);
  assert.ok(workspace.memberships.some((m) => m.organization_id === org));
  console.log("PASS Worker: profile and active organization restored");
  const list = await (await request("/api/properties" + q)).json();
  assert.ok(list.items.length);
  const id = list.items[0].id;
  const detail = await (await request("/api/properties/" + id + q)).json();
  assert.equal(detail.property.organization_id, org);
  console.log("PASS Worker: catch-all list and detail");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "base64",
  );
  const form = new FormData();
  form.set("file", new File([png], "worker-test.png", { type: "image/png" }));
  const upload = await (
    await request("/api/properties/" + id + "/images" + q, "POST", form)
  ).json();
  assert.ok(upload.imageId);
  console.log("PASS Worker: real multipart upload");
  const photo = "/api/properties/" + id + "/images/" + upload.imageId + q;
  const image = await request(photo);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.match(image.headers.get("cache-control"), /no-store/);
  console.log("PASS Worker: protected download bytes and cache headers");
  await request("/api/properties/" + id + "/images" + q, "PATCH", {
    order: [upload.imageId],
    cover: upload.imageId,
  });
  await request(photo, "DELETE");
  await request(photo, "GET", undefined, 404);
  console.log("PASS Worker: cover and physical file removal");
  await request("/properties/" + id);
  await request("/properties/" + id + "/edit");
  console.log("PASS Worker: direct private routes");
  const denied = await fetch(origin + "/api/properties" + q);
  assert.equal(denied.status, 401);
  console.log("PASS Worker: anonymous access denied");
} finally {
  await request("/api/hostflow", "POST", { action: "logout" }).catch(() => {});
}
