# HostFlow — UI Stability (v0.4.3 scope)

## Baseline

Deployed source at start: ff400bcc5ef97592fe3bcfff61470b540ec3b01a (Sites version 17).
It already contains Calendar Core v0.5. This UI-only change preserves that module and the existing release label; it does not introduce Calendar features.
Local starting snapshot tag: snapshot/pre-ui-stability-20260924. The original commit remains in the Sites source history.
GitHub snapshot to Adyo-Team/Hostflow was rejected by automatic approval review pending explicit user approval of that destination. No alternate upload attempted. No secrets or environment files added.

## Changes

- Removed vertical auto-centering of .hf-page inside the flex shell. Content now starts at a fixed top position independent of content height.
- Reserved scrollbar geometry and account/avatar space while authentication loads; no temporary sign-in label during session resolution.
- Shared Button, PageHeader, StatusBadge, FilterBar, PageLoading and Pager in components/hostflow/ui.tsx.
- Shared FormField with input/selection labeling in shared.tsx; existing primitive Input, Select, Textarea and Dialog remain in use.
- Shared CSS tokens for control height, radius, content width and status colors. Existing hf-panel remains the common card surface.
- Reused common headers on Dashboard, Properties forms/list, Reservations, Team, Settings and Roles. Property photo hero intentionally retained.
- Shared loading and empty states; wrapping actions on narrow screens; removed duplicate reservation pager and badges.
- Property tabs scroll horizontally without an unnecessary vertical scrollbar.
- Existing responsive check page supports 390, 768, 1024 and 1440 px and Reservations routes.

No database migration, RLS, API handler, authorization rule, organization model, or overlap engine changes.

## Validation (2026-09-24)

TypeScript, all 108 existing tests and production build passed. Tests include tenant isolation, permissions, properties, reservations and conflicts using existing database test harnesses; this is not a fresh live-database security audit.
Published version 19 smoke-tested in Cloud Browser: dashboard (/), Properties list/detail/edit, Reservations list/detail/edit/new, property reservations/blocks, Team, Settings, Roles; back/forward; sidebar navigation; repeated refresh. A hard-refresh keyboard shortcut was exercised; no independent cache-bypass trace is available.
Shell measured at x=242, y=76, width=1106 before and after workspace loading in the desktop browser. No temporary sign-in action during those measured refreshes.
Switched Jed conciergerie -> QA v0.4 — Tests, refreshed, verified organization-specific reservation list, then restored Jed conciergerie.
Mobile sidebar opens and closes on navigation. Properties list and reservation form measured without document overflow at all four frame widths. Property and Reservation details, Team and Settings visually reviewed at 390 px; Property also reviewed at 768, 1024 and 1440 px. Responsive uses a same-origin iframe with the real published app/session, not device emulation.
Login URL redirected an already authenticated session to dashboard. A new credential-entry login was not tested, and the session was not signed out.
Console entries observed were browser-extension metadata errors. Worker error query showed one canceled reservation GET during navigation, no application crash. Full browser network trace unavailable through the exposed browser API.
A frame measurement occasionally timed out after iframe navigation; those attempts were not counted as passes. Screenshots and working frame measurements were used instead.

## Follow-up

Use these common components and tokens for future screens. Complete a fresh sign-in and a browser network/cache trace before treating every requested acceptance check as closed. Explicit approval is still needed for the separate GitHub backup destination.
