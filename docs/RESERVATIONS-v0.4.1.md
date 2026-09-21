# Reservations hardening — 2026-09-21

Scope: preserve v0.4 schema, RLS, half-open exclusion constraint and transaction triggers. No migration or business architecture change.

## Changes

- French actionable messages for network interruption, timeout and invalid JSON; preserve caller cancellation and meaningful backend conflict errors. Network failure reproduced with mocked fetch before fixing.
- Extend SQL migration tests: conflicting block edit rollback, invalid block intervals, inactive/archived properties, cancellation/release after archive, missing property and deletion restriction, CRUD permissions for owner/admin/manager and denial for staff/property_owner/guest.
- Existing build workflow now runs typecheck and all critical tests before bundling in both execution profiles. No independent CI provider is configured for this Sites-hosted repository; this is a build gate, not a claim of a GitHub Actions runner.

## Automated verification

103 tests passed, TypeScript check passed, production build and published-bundle navigation contract passed. SQL tests apply the actual migrations in isolated PGlite/PostgreSQL. Prior v0.4 live API/concurrency results remain in RESERVATIONS-v0.4.md; they are not counted as new v0.4.1 runs.

## Supabase Auth

The live leaked-password-protection warning remains. Organization plan is Free; Supabase documents this feature as Pro and above: https://supabase.com/docs/guides/auth/password-security . No subscription upgrade or Auth replacement performed.

## Acceptance limits

Cloud browser available with authenticated Jed session. Measured viewport 1363×936. Runtime exposes no viewport/device-emulation capability; ordinary developer-tools shortcuts did not change it. A genuine 390px mobile acceptance run remains required. Do not mark mobile validation or full v0.4.1 acceptance complete from desktop screenshots.

Role matrix above is database-level testing. Fresh live UI sessions for every restricted role and network-failure injection remain unverified. No browser network-interception capability is exposed.

## Deployed desktop acceptance

Sites version 11 deployed successfully, source efe059c8713d954a9fc93289ad801c62213630fe. Cloud browser verified v0.4.1 branding and authenticated workspace after reload.

- Switched Jed conciergerie → QA organization; no real reservation changed.
- Created QA v041 — Delta on QA apartment A, September 10–15, 2035; edited arrival to September 9; refreshed detail and verified saved date.
- September 14–20 overlapping reservation refused with explicit French message (server HTTP 409).
- Cancelled Delta; created manual block September 10–15 on the dates released by cancellation; reservation on those dates refused (HTTP 409).
- Property detail displayed both cancelled reservation and active block. Released QA block after validation; no active v0.4.1 test occupancy remains.
- Search for introuvable-v041 returned clear zero-result state; initial loading and empty active-block state observed.
- Properties list/detail, sidebar Dashboard, browser back/forward and organization switch back to Jed conciergerie succeeded.
- Explicit logout reached login. Secure authentication handoff returned user_took_over; subsequent fresh visible DOM confirmed signed-in Jed workspace on Dashboard. Credentials were not observed.
- Inspected production worker errors for acceptance window: two expected 409 conflict responses and two navigation-cancelled GETs; no unexpected server failure in returned events. Browser warning/error sample contained only extension metadata errors, not HostFlow/React exceptions. This is not a complete browser network trace.

Full v0.4.1 acceptance remains open for real mobile and live role-specific UI sessions. Do not start v0.5 on the claim that every requested gate is complete.
