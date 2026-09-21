# Reservations Core v0.4

## Scope and baseline

Existing React/Next App Router conventions on Vinext/Workers, cookie-backed
Supabase Auth, BFF, Organizations and organization_members retained. Existing
five migrations matched the remote history. All 78 baseline tests passed.
The live Properties edit was saved and its changed internal name survived a refresh.

## Data and availability

Migration `20260921140121_reservations_core.sql` adds public `reservations` and
`property_blocks`, plus the private derived `property_occupancy` registry.
All child properties use a composite `(organization_id, property_id)` foreign key.
Reservations contain dates, confirmed/cancelled status, manual source, minimal
guest contact fields, count, notes, immutable creator/tenant identity, timestamps
and optimistic version. Future sources have schema values but writes remain
manual-only until a dedicated integration is implemented.
Blocks have exclusive end dates, owner/works/maintenance/internal reasons, notes,
active flag and the same identity/version fields. Cancellation/release preserves
history, removes occupancy, and does not send any message.

The registry contains only active reservations and active blocks. AFTER triggers
maintain it in the same transaction as every direct INSERT or UPDATE, including
REST writes. A GiST exclusion constraint on organization equality, property
equality and `daterange(start,end,'[)') &&` rejects all overlapping occupancy.
The exclusion index arbitrates conflicting uncommitted writes; there is no
check-then-insert window and no dependence on frontend availability checks.
Block/block overlaps are also refused. Adjacent stays are allowed. Cancelling
or moving a stay and updating occupancy are atomic. An exclusion failure rolls
back the business row and its audit event.

The single private SECURITY DEFINER trigger has empty search_path, qualified
names, explicit auth.uid/membership checks and no client EXECUTE grant. It only
maintains a private registry clients cannot alter. Public tables have forced RLS
and authenticated SELECT/INSERT/UPDATE policies reusing
`private.can_manage_properties` -> `private.role_in`. No client DELETE grants;
cancel/release are the supported operations. No auth or existing RLS is replaced.

## Application

`lib/reservations` owns types, Zod validation and BFF. `/api/reservations` performs
verified Auth, active membership, CSRF/origin, input size and tenant checks.
Updates compare the expected version atomically. DB conflict 23P01 returns HTTP
409 and a French availability message without database identifiers or guest data.
Reads are no-store, tenant-filtered and paginated (30). Guest search, status,
property and period filters are supported. Periods use the organization timezone.
The property selector currently loads at most 1000 non-archived properties.

Existing HostFlow components and styles are reused. Sidebar Reservations is live;
detail, create/edit, cancellation, blocks and property Reservations tab are added.
Tenant changes remount forms and clear prior data. No Calendar or integrations.

## Verification completed

- TypeScript, new-module ESLint and production build/navigation contract passed.
- 98 SQL/regression/client/validation tests passed.
- Migration applied successfully to the existing Supabase project.
- Remote overlapping writes: one committed, one rejected with 23P01;
  exactly one row persisted. The winner was then cancelled. A timestamped second
  experiment shows the connector serializes calls, so this is NOT yet proof of
  simultaneous transactions despite concurrent dispatch by the caller.
- Remote authenticated-role simulation of a foreign tenant: read/update/insert/
  delete isolation passed in a rolled-back transaction.
- Browser acceptance on the deployed v0.4 completed (see below).
- Live API concurrency gate passed after explicit user authorization: two
  independent temporary Auth users, five parallel reservation/reservation races
  and two reservation/block races. Requests started within 0–1 ms of each other
  and overlapped in flight; every race produced exactly one successful insert
  and one PostgreSQL 23P01 exclusion error. This is API-level concurrency evidence,
  not a claim to have instrumented the database transaction scheduler.
- Live API tests also passed valid create/edit/cancel, invalid edit, adjacent
  dates, different properties, conflicts in both directions, foreign tenant
  read/write/delete denial and staff denial. Raw sanitized evidence is retained
  in `tests/live-reservations-result.json`; harness in `.ts.template`.
- Both temporary accounts were globally signed out and deleted; their test
  reservations, blocks and memberships were removed. Audit records remain.
  The temporary Edge test runner was replaced with an inert HTTP 410 response;
  no administrative code remains deployed there. Its first attempt rejected an
  overlong generated password before creating any user; the harness was corrected.

QA data is isolated in organization `QA v0.4 — Tests`, with two explicitly named
fictitious properties. It is owned by the existing user. No email or invitation
was sent. The earlier cancelled SQL concurrency fixtures remain auditable.

## Known limits

Supabase password-leak protection was already disabled before this change and
has not been altered. The private registry intentionally has RLS with no policies
(deny all clients), like the existing private platform-admin table.
The historic intermittent 500 from v0.3.1 has no newly established cause.
Mobile viewport testing was not performed: the exposed Cloud browser controls
do not include viewport emulation. Desktop acceptance passed. No blocking
application defect remains from the tested scope.

## Deployed browser acceptance — 21 September 2026

Production: https://hostflow.jeeddd.chatgpt.site — Sites version 10, application
source `802eb3b1b84f30028499f7bf786e428668759945`. No application code changed
during acceptance; subsequent documentation commits only record results.

- Existing authenticated session survived deployment and repeated refreshes.
  Login was validated in the baseline; no fresh login was claimed in acceptance.
- Properties real edit/save passed again on v0.4. The original internal name
  was restored to NULL and verified directly in the database.
- Switched from Jed conciergerie to QA and back; reservation lists changed to
  the correct organization and remained correct after refresh.
- Sidebar navigation Dashboard / Properties / Reservations passed, as did
  browser back/forward between a property and the reservation list.
- Created QA Cloud — Alice on Apartment A, 10–15 September 2035; refreshed its
  detail and edited arrival to 9 September and saved an internal note.
- Bob on 14–20 September was rejected with the French availability conflict.
  Changing arrival to 15 September succeeded, proving same-day checkout/checkin.
- Cancelled Bob and Alice through confirmation dialogs; cancellation persisted
  after refresh. Created an Apartment A block on 10–15 September successfully,
  proving the cancelled stays no longer occupy the property.
- Charlie on Apartment A, 11–14 September was rejected because of that block.
  The same dates succeeded on Apartment B. Its property detail showed the stay.
- A block on Apartment B, 12–13 September was rejected because of Charlie.
- Apartment A's Properties Reservations tab showed its reservation history and
  block together; refresh of Properties remained functional.
- Cancelled Charlie and released the Apartment A block. Search Alice returned
  exactly one row; confirmed status filter returned zero QA reservations.
- Direct database cleanup verification: 3 cancelled Cloud stays, 0 active Cloud
  stays, 0 active QA blocks, 0 QA occupancy rows. The history is retained; no real
  customer reservation was modified. QA organization/properties remain reusable.

Browser input automation initially did not preserve date values (and one search
fill); native keyboard entry resolved it. Invalid dates were rejected without
saving. This was not a product code fix. Browser-required creation confirmation
was obtained before completing the test workflow.

## Main changed files

- `supabase/migrations/20260921140121_reservations_core.sql`
- `lib/reservations/{types,validation,server}.ts`
- `app/api/reservations/[[...path]]/route.ts`
- `app/reservations/{page.tsx,new/page.tsx,[id]/page.tsx,[id]/edit/page.tsx}`
- `components/hostflow/reservations/{client.ts,module.tsx}`
- `components/hostflow/properties/detail.tsx`, navigation, app and dashboard
- Supabase database types, HostFlow types, proxy and package version
- `tests/reservations*.test.mjs`, Properties test setup, live API harness/evidence

Next phase recommendation: consolidate CI around the existing reservation and
RLS tests and add mobile acceptance before building a read-only availability
view. Keep all future integrations behind the same occupancy constraint.
