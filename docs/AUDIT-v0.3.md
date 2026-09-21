# Audit initial — Properties v0.3

Audit réalisé avant la première modification du lot, le 14 septembre 2026.

- Next.js 16.3.4, React 19.2, TypeScript strict, Tailwind et primitives shadcn existantes. Publication Sites via Vinext. Aucun remplacement de stack ou de design.
- Auth Supabase SSR derrière `/api/hostflow`, cookies HttpOnly, protection des routes via `proxy.ts`. Compte personnel indépendant des organisations, accueil `/welcome` et adhésion par invitation déjà fonctionnels.
- L’organisation sélectionnée est un cookie `hf-organization`, validé contre les memberships actifs. Les permissions effectives sont relues en base par `private.role_in` ; aucune confiance accordée au tenant envoyé par le navigateur.
- Tables existantes : profiles, organizations, organization_members, organization_invitations, audit_logs ; vue de compatibilité organization_memberships. RLS active. Les trois migrations du socle étaient appliquées et ont été conservées.
- Rôles actuels : owner, admin, manager, staff. property_owner et guest réservés. Réutilisation de cette matrice ; aucune nouvelle attribution de rôle dans ce lot.
- Logements était une entrée de navigation « à venir », sans page métier, table, stockage ni type de logement. Aucun module Owners existant à réutiliser.
- Dashboard déjà connecté au compte, à l’équipe et à l’audit. Les indicateurs non disponibles étaient des états vides ; ajout prévu du seul nombre réel de logements actifs.
- Supabase distant inspecté : projet HostFlow existant, données utilisateur conservées, aucun bucket ni policy Storage métier avant ce lot. Aucune clé service_role dans l’application.
- Composants réutilisés : shell, navigation mobile, styles hf-*, Field, Choice, EmptyState, Button, Input, Select, Checkbox, Tabs, AlertDialog, Skeleton, Pagination.
- Tests existants : migrations et permissions du socle, validation des invitations, sécurité des origines et acceptation distante optionnelle.

Décision : module indépendant `lib/properties` + `components/hostflow/properties`, BFF `/api/properties`, migration additive. Auth, organisation et politiques existantes restent le socle de sécurité.
