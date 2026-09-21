export function backendConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  const appUrl = process.env.APP_URL;
  if (!url || !key || !appUrl) return null;
  if (key.startsWith("sb_secret_")) return null;
  if (!key.startsWith("sb_publishable_")) {
    try {
      const claim: unknown = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (
        !claim ||
        typeof claim !== "object" ||
        !("role" in claim) ||
        claim.role !== "anon"
      )
        return null;
    } catch {
      return null;
    }
  }
  try {
    if (!["https:", "http:"].includes(new URL(url).protocol)) return null;
    if (!["https:", "http:"].includes(new URL(appUrl).protocol)) return null;
  } catch {
    return null;
  }
  return { url, key, appUrl: new URL(appUrl).origin };
}
