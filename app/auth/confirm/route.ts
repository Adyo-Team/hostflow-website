import { NextResponse } from "next/server";
import { serverSupabase, backendConfig } from "@/lib/supabase/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const config = backendConfig();
  if (!config)
    return NextResponse.redirect(
      new URL("/login?error=configuration", url.origin),
    );
  const db = await serverSupabase();
  const code = url.searchParams.get("code");
  const hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type");
  let success = false;
  if (code) {
    const { error } = await db.auth.exchangeCodeForSession(code);
    success = !error;
  } else if (hash && (type === "email" || type === "recovery")) {
    const { error } = await db.auth.verifyOtp({ token_hash: hash, type });
    success = !error;
  }
  const recovery =
    type === "recovery" || url.searchParams.get("flow") === "recovery";
  const destination = success
    ? recovery
      ? "/reset-password"
      : "/welcome"
    : "/login?error=confirmation";
  const response = NextResponse.redirect(new URL(destination, config.appUrl));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
