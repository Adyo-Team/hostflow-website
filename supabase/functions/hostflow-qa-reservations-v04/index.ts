// QA completed; no administrative code or secret remains.
declare const Deno: {
  serve(handler: () => Response): void;
};

Deno.serve(() => new Response("QA completed", { status: 410 }));
