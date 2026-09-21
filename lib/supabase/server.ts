import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { backendConfig } from "./config";
export { backendConfig } from "./config";
// Route handlers own cookie refresh. No privileged service-role client exists.
export async function serverSupabase() {
  const config = backendConfig();
  if (!config) throw new Error("backend_not_configured");
  const jar = await cookies();
  return createServerClient<Database>(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: new URL(config.appUrl).protocol === "https:",
      path: "/",
    },
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) =>
        values.forEach(({ name, value, options }) =>
          jar.set(name, value, options),
        ),
    },
  });
}
export async function setActiveOrganization(id: string) {
  const jar = await cookies();
  jar.set("hf-organization", id, {
    httpOnly: true,
    sameSite: "lax",
    secure: backendConfig()?.appUrl.startsWith("https:"),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}
