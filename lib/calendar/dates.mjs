/** Civil dates are calculated in UTC: no daylight-saving drift. */
export function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const d = new Date(value + "T12:00:00Z");
  return Number.isFinite(+d) && d.toISOString().slice(0, 10) === value;
}
export function addDays(value, days) {
  const d = new Date(value + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function dayDistance(start, end) {
  return Math.round(
    (Date.parse(end + "T12:00:00Z") - Date.parse(start + "T12:00:00Z")) /
      86400000,
  );
}
export function overlaps(start, end, otherStart, otherEnd) {
  return start < otherEnd && end > otherStart;
}
export function placement(start, end, visibleStart, visibleEnd) {
  if (!overlaps(start, end, visibleStart, visibleEnd)) return null;
  return {
    offset: dayDistance(
      visibleStart,
      start < visibleStart ? visibleStart : start,
    ),
    span: dayDistance(
      start < visibleStart ? visibleStart : start,
      end > visibleEnd ? visibleEnd : end,
    ),
  };
}
export function todayInZone(zone = "Europe/Brussels") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Occupied visible nights, with an exclusive departure. Pure display projection. */
export function occupiedDays(start, end, visibleStart, visibleEnd) {
  const clipped = placement(start, end, visibleStart, visibleEnd);
  return clipped
    ? Array.from({ length: clipped.span }, (_, i) => clipped.offset + i)
    : [];
}
