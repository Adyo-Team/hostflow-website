# Audit préalable — HostFlow Foundation v0.2

Audit réalisé avant modification du code produit sur le commit `5e4ac0a`.

- Projet existant : Next.js 16.3.4, React 19, TypeScript strict, Tailwind, shadcn ; hébergement Sites/Vinext. pnpm et lockfile conservés.
- Toutes les routes, composants HostFlow, types, schémas Zod, API, client Supabase serveur, migration et tests ont été inspectés. Les primitives shadcn sont des dépendances vendoriées ; aucun remplacement prévu.
- Routes : `/`, `/team`, `/settings`, `/roles`, `/signup`, `/login`, `/forgot-password`, `/reset-password`, `/onboarding`, `/invite`, `/auth/confirm`, `/api/hostflow`.
- Auth existante : Supabase SSR via BFF et cookies HttpOnly ; inscription/connexion/récupération/callback codés. Aucun faux compte. Redirections et reprise des invitations incomplètes.
- Backend : `organizations`, `organization_memberships`, `organization_invitations`, `audit_logs`, registre privé plateforme. Aucune table `profiles`. Rôle initial `organization_admin`, sans distinction owner/admin. Absence de pays et de retrait définitif d’une adhésion.
- Sécurité existante : RLS en lecture et mutations contrôlées par RPC, hash d’invitation, email confirmé, protection du dernier administrateur. Tests PostgreSQL embarqués ; aucun test Supabase Auth distant exécuté dans la version initiale.
- Dashboard : métriques métier déjà vides (`—`), checklist calculée ; pas de données métier simulées. L’équipe et la progression doivent être enrichies depuis la base.
- Configuration locale : seul `.env.example`, aucune configuration Supabase active. Variables de production Sites : aucune.
- Compte Supabase inspecté : deux projets suspendus, aucun projet HostFlow identifié. Aucune modification de ces projets. Espace disponible : `jedxds' projects`. Le choix du projet/espace distant reste à confirmer avant création.

Décision : conserver l’architecture BFF, le design, les routes et composants. Ajouter des migrations compatibles au schéma initial, renommer l’adhésion en `organization_members` avec vue de compatibilité à sécurité invoker, introduire profils privés, owner/admin et permissions en base. Aucun module métier supplémentaire.
