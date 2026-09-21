// Extract a token without ever navigating to a pasted external destination.
export function invitationToken(value: string, origin: string): string | null {
  const input = value.trim();
  if (/^[a-f0-9]{64}$/.test(input)) return input;
  try {
    const url = new URL(input, origin);
    const token = url.searchParams.get("token");
    return url.origin === new URL(origin).origin &&
      url.pathname === "/invite" &&
      token &&
      /^[a-f0-9]{64}$/.test(token)
      ? token
      : null;
  } catch {
    return null;
  }
}
