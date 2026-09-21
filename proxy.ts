import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { backendConfig } from "@/lib/supabase/config";
import type { Database } from "@/lib/supabase/database.types";
// Routes render only a shell. The API independently revalidates the user and RLS.
export async function proxy(request: NextRequest) {
  const config = backendConfig();
  if (!config) return NextResponse.next();
  let response = NextResponse.next({ request });
  const db = createServerClient<Database>(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.appUrl.startsWith("https:"),
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  const { data, error } = await db.auth.getUser();
  const path = request.nextUrl.pathname;
  const privateRoute =
    [
      "/",
      "/team",
      "/settings",
      "/roles",
      "/onboarding",
      "/welcome",
      "/reset-password",
    ].includes(path) ||
    path === "/properties" ||
    path.startsWith("/properties/") ||
    path === "/reservations" ||
    path.startsWith("/reservations/");
  let destination: string | null = null;
  // Network failure is handled by the API error state, rather than an auth loop.
  if (
    !data.user &&
    privateRoute &&
    (!error ||
      (error.status ?? 500) < 500 ||
      error.name === "AuthSessionMissingError")
  )
    destination = "/login";
  if (data.user && ["/login", "/signup"].includes(path)) destination = "/";
  if (destination) {
    const redirect = NextResponse.redirect(new URL(destination, config.appUrl));
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    response = redirect;
  }
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  response.headers.set("Vary", "Cookie");
  return response;
}
export const config = {
  matcher: [
    "/reservations/:path*",
    "/properties/:path*",
    "/",
    "/team",
    "/settings",
    "/roles",
    "/onboarding",
    "/welcome",
    "/reset-password",
    "/login",
    "/signup",
  ],
};
