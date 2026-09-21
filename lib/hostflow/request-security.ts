export function safeOrigin(
  origin: string | null,
  requestUrl: string,
  canonical?: string,
) {
  if (!origin) return false;
  const trusted = canonical
    ? new URL(canonical).origin
    : new URL(requestUrl).origin;
  return origin === trusted;
}
