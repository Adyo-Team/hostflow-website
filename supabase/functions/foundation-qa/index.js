// The explicitly authorized three-account test provisioner is permanently closed.
// No administrative client, credential or test-account creation remains here.
Deno.serve(() => new Response("Test provisioning closed", {
  status: 410,
  headers: { "Cache-Control": "no-store" },
}));
