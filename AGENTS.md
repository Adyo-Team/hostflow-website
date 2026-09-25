# HostFlow — règles permanentes

## Projet et source de vérité

HostFlow est un SaaS B2B multi-tenant de gestion de conciergerie courte durée. Une `Organization` représente une conciergerie. Le repository ouvert est la source de vérité : inspecter le code, les tests et la documentation avant toute modification. Consulter `docs/STATUS.md` pour l'état constaté et `docs/ROADMAP.md` pour les étapes prévues.

## Architecture et sécurité

- Respecter strictement les RLS, Memberships, Roles et permissions existantes. Réutiliser leurs contrôles côté serveur et en base ; ne jamais créer un deuxième système de permissions.
- Le choix d'une organisation côté client ou dans un cookie ne constitue jamais une autorisation. Préserver les contrôles d'appartenance active et l'isolation entre organisations.
- Ne jamais casser Auth, Properties, Reservations, Property Blocks, Calendar ou Operations / Tasks. Préserver également Organizations, Team et les profils.
- Les réservations utilisent des intervalles `[check_in, check_out)` : le départ est exclusif et deux séjours adjacents sont autorisés. Préserver le contrôle transactionnel des chevauchements entre réservations et blocages en base.
- Ne jamais modifier une migration Supabase déjà appliquée : créer une nouvelle migration pour toute évolution du schéma, des fonctions ou des policies.
- Ne jamais exécuter `supabase db reset --linked` sur une base distante.
- Ne jamais committer de fichier `.env`, mot de passe, token, clé `service_role` ou autre secret. Seul un exemple de configuration sans secret peut être versionné.

## Interface et périmètre

- Réutiliser le design system existant : `components/ui/`, `components/hostflow/ui.tsx`, les composants partagés et les tokens de `app/globals.css`.
- Pas de redesign global sans demande explicite.
- Modifier uniquement ce qui est nécessaire à la tâche ; éviter les refactorings et changements de dépendances hors périmètre.
- Ne pas présenter une fonctionnalité prévue comme déjà livrée. Distinguer les résultats locaux des validations distantes ou navigateur.

## Git et validation

- `main` représente la version stable. Utiliser une branche dédiée pour chaque grosse feature, avec le préfixe `codex/` sauf demande contraire.
- Inspecter l'état Git avant et après le travail et préserver les modifications préexistantes.
- Ne pas committer automatiquement sans demande de l'utilisateur.
- Avant de terminer une tâche, exécuter les trois commandes suivantes :

```sh
pnpm typecheck
pnpm test
pnpm build
```

- Signaler clairement les échecs, blocages et éléments qui n'ont pas pu être testés. Un build interrompu avant compilation n'est pas un build validé.
- Garder les corrections dans le périmètre autorisé : si une vérification révèle un problème hors périmètre, le documenter sans le corriger implicitement.
