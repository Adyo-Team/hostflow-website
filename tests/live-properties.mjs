// Opt-in acceptance: real Supabase sessions, API, RLS and Storage bytes.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
const origin = process.env.HOSTFLOW_TEST_ORIGIN;
assert.ok(origin && process.env.HOSTFLOW_TEST_ACCOUNTS_FILE);
const input = JSON.parse(
  await readFile(process.env.HOSTFLOW_TEST_ACCOUNTS_FILE, "utf8"),
);
const sessions = input.accounts.map((account) => {
  const jar = new Map();
  return {
    account,
    jar,
    async request(path, method = "GET", body) {
      const headers = {
        Origin: origin,
        Cookie: [...jar].map(([k, v]) => k + "=" + v).join("; "),
      };
      if (body && !(body instanceof FormData))
        headers["Content-Type"] = "application/json";
      const started = Date.now();
      const r = await fetch(origin + path, {
        method,
        headers,
        redirect: "manual",
        body: body
          ? body instanceof FormData
            ? body
            : JSON.stringify(body)
          : undefined,
        signal: AbortSignal.timeout(120000),
      });
      console.log(
        "HTTP",
        method,
        path.split("?")[0],
        r.status,
        Date.now() - started + "ms",
      );
      for (const c of r.headers.getSetCookie()) {
        const p = c.split(";")[0],
          i = p.indexOf("=");
        if (!p.slice(i + 1) || /max-age=0/i.test(c)) jar.delete(p.slice(0, i));
        else jar.set(p.slice(0, i), p.slice(i + 1));
      }
      return r;
    },
    async api(body) {
      const r = await this.request(
        "/api/hostflow",
        body ? "POST" : "GET",
        body,
      );
      const data = await r.json();
      assert.equal(r.status, 200, JSON.stringify(data));
      return data;
    },
    async prop(org, path = "", method = "GET", body, status = 200) {
      const r = await this.request(
        "/api/properties" +
          path +
          (path.includes("?") ? "&" : "?") +
          "organization_id=" +
          org,
        method,
        body,
      );
      const data = await r.json();
      assert.equal(r.status, status, JSON.stringify(data));
      return data;
    },
  };
});
const [a, b, m] = sessions;
const clients = [];
let checks = 0;
function pass(label) {
  checks++;
  console.log("PASS", checks, label);
}
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
  "base64",
);
const base = {
  name: "QA Appartement " + input.tag,
  internal_name: "Test only",
  status: "active",
  address_line1: "1 rue de test",
  address_line2: null,
  postal_code: "1000",
  city: "Bruxelles",
  country: "BE",
  latitude: 50.85,
  longitude: 4.35,
  property_type: "apartment",
  capacity: 4,
  bedrooms: 2,
  beds: 3,
  bathrooms: 1.5,
  check_in_time: "15:00",
  check_out_time: "11:00",
  wifi_name: "QA network",
  wifi_password: "QA private password",
  access_instructions: "QA private access",
  cleaning_instructions: "QA instructions",
  private_notes: "QA private notes",
  cleaning_fee: 65.5,
  management_commission_percent: 20,
};
let alpha, beta, propertyId;
try {
  for (const s of sessions)
    await s.api({
      action: "login",
      email: s.account.email,
      password: s.account.password,
    });
  pass("Three real Auth sessions");
  const personal = await m.api();
  assert.equal(personal.memberships.length, 0);
  pass("Personal account without creating an organization");
  for (const [s, label] of [
    [a, "Alpha"],
    [b, "Beta"],
  ]) {
    const state = await s.api();
    if (!state.memberships.length)
      await s.api({
        action: "createOrganization",
        name: "QA Properties " + label + " " + input.tag,
        slug: "qa-properties-" + label.toLowerCase() + "-" + input.tag,
        country: "BE",
        currency: "EUR",
        timezone: "Europe/Brussels",
      });
  }
  alpha = (await a.api()).activeOrganizationId;
  beta = (await b.api()).activeOrganizationId;
  input.organizations = [alpha, beta];
  await writeFile(
    process.env.HOSTFLOW_TEST_ACCOUNTS_FILE,
    JSON.stringify(input),
    { mode: 0o600 },
  );
  const invite = await a.api({
    action: "createInvitation",
    organizationId: alpha,
    email: m.account.email,
    role: "manager",
  });
  await m.api({
    action: "acceptInvitation",
    token: new URL(invite.invitationUrl).searchParams.get("token"),
  });
  const membership = (await m.api()).memberships.find(
    (x) => x.organization_id === alpha,
  );
  pass("Owner organizations and invited manager");
  propertyId = randomUUID();
  let d = await a.prop(
    alpha,
    "",
    "POST",
    {
      id: propertyId,
      version: null,
      property: base,
      amenities: ["wifi", "parking"],
    },
    201,
  );
  assert.equal(d.property.created_by, a.account.id);
  assert.deepEqual(d.amenities.sort(), ["parking", "wifi"]);
  pass("Create property and structured amenities");
  const repeated = await a.prop(
    alpha,
    "",
    "POST",
    { id: propertyId, version: null, property: base, amenities: ["wifi"] },
    201,
  );
  assert.deepEqual(repeated.amenities.sort(), ["parking", "wifi"]);
  pass("Safe retry of uncertain creation");
  let listing = await a.prop(alpha);
  assert.ok(listing.items.some((p) => p.id === propertyId));
  assert.equal(listing.items[0].wifi_password, undefined);
  pass("List contains real property and excludes sensitive fields");
  d = await a.prop(alpha, "/" + propertyId);
  assert.equal(d.property.private_notes, base.private_notes);
  pass("Detail returns saved values");
  const edited = {
    ...base,
    name: "QA Villa " + input.tag,
    city: "Namur",
    property_type: "villa",
    capacity: 6,
  };
  d = await m.prop(alpha, "/" + propertyId, "PUT", {
    id: propertyId,
    version: d.property.version,
    property: edited,
    amenities: ["wifi", "pool"],
  });
  assert.equal(d.property.capacity, 6);
  assert.deepEqual(d.amenities.sort(), ["pool", "wifi"]);
  pass("Manager edit and amenity replacement");
  await a.prop(
    alpha,
    "/" + propertyId,
    "PUT",
    { id: propertyId, version: 1, property: base, amenities: [] },
    409,
  );
  pass("Concurrent stale update rejected");
  await a.prop(
    alpha,
    "",
    "POST",
    {
      id: randomUUID(),
      version: null,
      property: { ...base, capacity: 0 },
      amenities: [],
    },
    400,
  );
  pass("Invalid capacity rejected by API");
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const form = new FormData();
    form.set(
      "file",
      new File([png], "qa-" + i + ".png", { type: "image/png" }),
    );
    const r = await a.prop(alpha, "/" + propertyId + "/images", "POST", form);
    ids.push(r.imageId);
  }
  d = await a.prop(alpha, "/" + propertyId);
  assert.equal(d.images.length, 3);
  assert.equal(d.images.filter((i) => i.is_cover).length, 1);
  pass("Three real Storage image uploads");
  await a.prop(alpha, "/" + propertyId + "/images", "PATCH", {
    order: [ids[2], ids[0], ids[1]],
    cover: ids[2],
  });
  d = await a.prop(alpha, "/" + propertyId);
  assert.equal(d.images[0].id, ids[2]);
  assert.equal(d.images.find((i) => i.is_cover).id, ids[2]);
  pass("Cover change and image ordering");
  const photo =
    "/api/properties/" +
    propertyId +
    "/images/" +
    ids[2] +
    "?organization_id=" +
    alpha;
  const download = await a.request(photo);
  assert.equal(download.status, 200);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), png);
  assert.match(download.headers.get("Cache-Control"), /no-store/);
  pass("Private image download returns original bytes");
  await b.prop(alpha, "/" + propertyId, "GET", undefined, 403);
  await b.prop(beta, "/" + propertyId, "GET", undefined, 404);
  assert.equal((await b.request(photo)).status, 403);
  assert.equal((await fetch(origin + photo)).status, 401);
  pass("Beta cannot read Alpha property or photo through API");
  for (const s of [b, m]) {
    const c = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_PUBLISHABLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const r = await c.auth.signInWithPassword({
      email: s.account.email,
      password: s.account.password,
    });
    assert.ifError(r.error);
    clients.push(c);
  }
  const [cb, cm] = clients;
  for (const t of ["properties", "property_images", "property_amenities"]) {
    const r = await cb.from(t).select("*").eq("organization_id", alpha);
    assert.ifError(r.error);
    assert.deepEqual(r.data, []);
  }
  const storagePath = d.images.find((i) => i.id === ids[2]).storage_path;
  assert.ok(
    (await cb.storage.from("property-photos").download(storagePath)).error,
  );
  const foreignList = await cb.storage
    .from("property-photos")
    .list(alpha + "/" + propertyId);
  assert.ifError(foreignList.error);
  assert.deepEqual(foreignList.data, []);
  assert.ok(
    (
      await cb.storage
        .from("property-photos")
        .upload(alpha + "/" + propertyId + "/" + randomUUID() + ".png", png, {
          contentType: "image/png",
        })
    ).error,
  );
  const attempted = await cb.storage
    .from("property-photos")
    .remove([storagePath]);
  assert.ifError(attempted.error);
  assert.deepEqual(attempted.data, []);
  assert.equal((await a.request(photo)).status, 200);
  pass("CRITICAL: direct Supabase RLS and Storage deny Beta read/write/delete");
  await m.prop(
    alpha,
    "/" + propertyId,
    "PATCH",
    { archived: true, version: d.property.version },
    403,
  );
  pass("Manager cannot archive");
  await a.api({
    action: "updateMembership",
    organizationId: alpha,
    membershipId: membership.id,
    role: "staff",
    status: "active",
  });
  await m.prop(alpha, "/" + propertyId, "GET", undefined, 403);
  assert.equal((await m.request(photo)).status, 403);
  const staffRead = await cm
    .from("properties")
    .select("*")
    .eq("organization_id", alpha);
  assert.ifError(staffRead.error);
  assert.deepEqual(staffRead.data, []);
  assert.ok(
    (await cm.storage.from("property-photos").download(storagePath)).error,
  );
  pass("Staff restrictions take effect immediately on existing sessions");
  await a.api({
    action: "updateMembership",
    organizationId: alpha,
    membershipId: membership.id,
    role: "manager",
    status: "active",
  });
  const spoof = new FormData();
  spoof.set(
    "file",
    new File(["<svg></svg>"], "fake.png", { type: "image/png" }),
  );
  await a.prop(alpha, "/" + propertyId + "/images", "POST", spoof, 415);
  const oversized = new FormData();
  oversized.set(
    "file",
    new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
      type: "image/png",
    }),
  );
  await a.prop(alpha, "/" + propertyId + "/images", "POST", oversized, 413);
  pass("Spoofed image and oversized file rejected");
  const other = randomUUID();
  await a.prop(
    alpha,
    "",
    "POST",
    { id: other, version: null, property: base, amenities: [] },
    201,
  );
  for (const query of ["?search=Villa", "?city=Namur", "?type=villa"]) {
    listing = await a.prop(alpha, query);
    assert.equal(listing.total, 1);
    assert.equal(listing.items[0].id, propertyId);
  }
  listing = await a.prop(alpha, "?sort=name&pageSize=1&page=2");
  assert.equal(listing.items.length, 1);
  assert.equal(listing.total, 2);
  pass("Search, city/type filters, sorting and pagination");
  await a.prop(alpha, "/" + propertyId, "PATCH", {
    archived: true,
    version: d.property.version,
  });
  assert.equal((await a.prop(alpha, "?status=archived")).total, 1);
  assert.equal((await a.prop(alpha, "?status=active")).total, 1);
  assert.equal((await a.request(photo)).status, 200);
  pass("Archive preserves detail and photos, filters reflect status");
  d = await a.prop(alpha, "/" + propertyId);
  await a.prop(alpha, "/" + propertyId, "PATCH", {
    archived: false,
    version: d.property.version,
  });
  d = await a.prop(alpha, "/" + propertyId);
  assert.equal(d.property.status, "inactive");
  pass("Restore keeps history");
  for (const id of ids)
    await a.prop(alpha, "/" + propertyId + "/images/" + id, "DELETE");
  assert.equal((await a.prop(alpha, "/" + propertyId)).images.length, 0);
  assert.equal((await a.request(photo)).status, 404);
  pass("Real file deletion and metadata cleanup");
  await a.api({ action: "logout" });
  assert.ok(
    [302, 303, 307, 308].includes(
      (await a.request("/properties/" + propertyId)).status,
    ),
  );
  await a.api({
    action: "login",
    email: a.account.email,
    password: a.account.password,
  });
  await a.api({ action: "switchOrganization", organizationId: alpha });
  assert.equal((await a.request("/properties/" + propertyId)).status, 200);
  assert.equal((await a.api()).activeOrganizationId, alpha);
  pass(
    "Logout, login and direct private-detail reload restore session and organization",
  );
  console.log(
    "LIVE PROPERTIES ACCEPTANCE PASSED:",
    checks,
    "checks. QA database records retained for exact cleanup.",
  );
} finally {
  for (const s of sessions) await s.api({ action: "logout" }).catch(() => {});
  for (const c of clients)
    await c.auth.signOut({ scope: "global" }).catch(() => {});
}
