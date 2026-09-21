import test from "node:test";
import assert from "node:assert/strict";
import { invitationToken } from "../lib/hostflow/invitations.ts";
const origin = "https://hostflow.example";
const token = "a".repeat(64);
test("invitation entry accepts a HostFlow link or its exact token", () => {
  assert.equal(
    invitationToken(origin + "/invite?token=" + token, origin),
    token,
  );
  assert.equal(invitationToken("/invite?token=" + token, origin), token);
  assert.equal(invitationToken("  " + token + "  ", origin), token);
});
test("invitation entry rejects foreign destinations and malformed tokens", () => {
  for (const value of [
    "",
    "javascript:alert(1)",
    "https://attacker.example/invite?token=" + token,
    origin + "/login?token=" + token,
    origin + "/invite?token=bad",
  ])
    assert.equal(invitationToken(value, origin), null);
});
