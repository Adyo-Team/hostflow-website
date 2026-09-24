# Calendar Core — v0.5

Calendar is a read-only projection of Properties, confirmed Reservations and active Property Blocks. No schema, RLS or occupancy/GiST changes.

- `/calendar`: 7/14/31 civil days, URL-backed period and resource pagination; organization timezone determines today.
- `GET /api/reservations/calendar?organization_id=…&start=YYYY-MM-DD&end=YYYY-MM-DD&page=1`: existing authenticated reservation handler and owner/admin/manager role gate. All queries use the user's Supabase session/RLS and explicit organization filters.
- Loads 30 non-archived properties, then the two overlapping event sets concurrently (`start < visibleEnd AND end > visibleStart`). Selects display fields only. Event pages of 500 avoid silent API truncation; a safety bound returns an explicit error.
- Cancelled stays/released blocks are omitted because they no longer occupy dates. Inactive properties remain visible but have no create affordance. Archived properties are omitted.
- Empty date opens the existing form with property and one-night stay prefilled. Dates remain editable and existing transactional conflict checks remain authoritative. Opening a form does not reserve availability.
- Labels, keyboard links, contained horizontal scrolling and sticky property column. No drag/drop, resizing or external integration.
- Existing resource hook aborts obsolete requests and hides previous organization/period data while loading. Refresh button reloads availability.

Run `pnpm test`, `pnpm run typecheck`, `pnpm run build`. Calendar civil-date/interval and API wiring tests are in `tests/calendar.test.mjs`; database isolation/conflict tests remain in `tests/reservations.test.mjs`.

## PMS usability follow-up

- Reuses shared HostFlow PageHeader, Button, Field, Choice, StatusBadge, Pager and empty/loading primitives.
- Date input jumps directly to a visible period; 7/14/31-day views, previous/next and today remain URL-backed.
- Resource names and day headers stay visible while scrolling inside a bounded calendar surface. Mobile keeps its narrower sticky resource column.
- Reservation and block colors use the shared status tokens. Visible arrows mark events continuing beyond the displayed range; accessible labels retain complete dates.
- Visible occupied nights are derived once per loaded range and reused for empty-cell links. No new requests per cell, data model or availability authority; saves continue through existing reservation conflict checks.
- Date-range projection test covers adjacent stays, clipped stays, blocks and exclusive checkout.
