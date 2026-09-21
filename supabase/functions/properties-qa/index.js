Deno.serve(
  () =>
    new Response("Properties test provisioning closed", {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }),
);
