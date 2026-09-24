export function localDateTime(iso, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function toInstant(value, timeZone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error("Indiquez une date et une heure.");
  const base = Date.parse(value + "Z");
  const matches = [];
  // Discover offsets on both sides of daylight-saving changes. Do not silently move a nonexistent local time.
  for (const shift of [-36, 0, 36]) {
    const probe = base + shift * 3600000;
    const offset =
      Date.parse(localDateTime(new Date(probe).toISOString(), timeZone) + "Z") -
      probe;
    const candidate = new Date(base - offset).toISOString();
    if (
      localDateTime(candidate, timeZone) === value &&
      !matches.includes(candidate)
    )
      matches.push(candidate);
  }
  if (!matches.length)
    throw new Error(
      "Cette heure n’existe pas dans le fuseau de l’organisation (changement d’heure). Choisissez une autre heure.",
    );
  if (matches.length > 1)
    throw new Error(
      "Cette heure est ambiguë lors du changement d’heure. Choisissez une heure en dehors de cette transition.",
    );
  return matches[0];
}
