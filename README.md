# HostFlow

HostFlow est un SaaS B2B multi-tenant destiné aux conciergeries de location courte durée. La version actuelle (`v0.6 — Operations / Tasks`) comprend l’authentification, les organisations et rôles, l’équipe, les logements, les photos privées, les réservations manuelles, les blocages de disponibilité, le calendrier et la gestion des tâches opérationnelles.

Chaque conciergerie est une `Organization`. L’isolation des données est assurée dans PostgreSQL par les memberships, les rôles et la Row Level Security (RLS). Les conflits de réservation utilisent des intervalles `[arrivée, départ)` et une contrainte d’exclusion PostgreSQL transactionnelle.

## Stack technique

- Next.js 16 App Router, React 19 et TypeScript ;
- Tailwind CSS 4 et composants shadcn ;
- Supabase Auth, PostgreSQL, Storage et Edge Functions ;
- runtime Node.js Next.js natif, préparé pour Railway ;
- pnpm 11 avec lockfile versionné ;
- Node.js 22.13 minimum, Node.js 24 pour Railway.

## Structure

```text
app/                     Pages Next.js et route handlers API
components/hostflow/     Modules métier et écrans HostFlow
components/ui/           Primitives UI partagées
lib/                     Validation, accès serveur, types et Supabase SSR
public/                  Assets publics
supabase/config.toml     Configuration de la stack Supabase locale
supabase/migrations/     Schéma SQL versionné, RLS, fonctions et triggers
supabase/functions/      Edge Functions versionnées
tests/                   Tests unitaires, PostgreSQL et parcours distants
docs/                    Architecture, audits et validations par version
scripts/                 Lanceur Node de développement, build et production
```

## Installation

```bash
git clone https://github.com/Adyo-Team/Hostflow.git
cd Hostflow
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
```

Renseigner ensuite `.env.local` :

```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_PUBLISHABLE_KEY=votre-cle-publiable-ou-anon
APP_URL=http://localhost:3000
```

HostFlow n’utilise pas de clé `service_role` pour fonctionner. Une clé secrète Supabase ne doit jamais être placée dans une variable exposée au navigateur ni commitée dans Git.

Les variables `NODE_ENV` et `RAILPACK_*` sont documentées en commentaires dans `.env.example` et se configurent dans Railway. Les laisser commentées dans `.env.local` ; Next.js choisit automatiquement son mode selon la commande.

## Développement local

Les commandes principales utilisent Next.js natif :

```bash
pnpm dev
```

Ouvrir `http://localhost:3000`. `APP_URL` doit être exactement cette origine. Les commandes `dev:next`, `build:next` et `start:next` sont conservées ; `build:next` compile directement, sans les checks préalables de `pnpm build`.

## Supabase

### Utiliser un projet Supabase hébergé

Créer un projet séparé de la production, renseigner ses valeurs publiques dans `.env.local`, puis appliquer les migrations après avoir vérifié la cible :

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref VOTRE_PROJECT_REF
pnpm exec supabase migration list
pnpm exec supabase db push --dry-run
pnpm exec supabase db push
```

Ne jamais exécuter `supabase db reset --linked` sur la production : cette commande détruit les données de la base liée.

### Lancer Supabase localement

Docker doit être installé et démarré. La configuration locale et les migrations sont incluses dans le repository :

```bash
pnpm exec supabase start
pnpm exec supabase db reset
```

`db reset` ne vise ici que la base locale et rejoue toutes les migrations ainsi que `supabase/seed.sql`. Le seed ne contient aucune donnée de production. Les URL et clés locales affichées par la CLI peuvent ensuite être placées dans `.env.local`.

Les migrations recréent notamment Organizations, Memberships, Roles, Profiles, Properties, Reservations, Property Blocks, RLS, policies, fonctions SQL, triggers d’audit, Storage et protection anti-chevauchement.

## Vérifications

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm build
```

`pnpm build` exécute également le typecheck et les tests avant la compilation Next.js de production. Les dépendances de développement sont donc nécessaires pendant l’installation et le build.

Après un build réussi :

```bash
pnpm start
```

Le serveur écoute sur `0.0.0.0`, au port `PORT` fourni par l’hébergeur ou au port `3000` en local. Supabase reste le backend ; aucun PostgreSQL Railway ni volume persistant n’est nécessaire.

`pnpm test:production` vérifie le démarrage et les routes HTTP après compilation, sans envoyer d’identifiants à Supabase.

## Railway staging

Voir [le guide Railway](docs/RAILWAY.md) pour les commandes, les variables et la configuration Auth. La branche de migration est `codex/railway-migration`. Le déploiement Sites existant et la production restent en place jusqu’à validation de la bascule.

## Documentation

- [Mise en service Supabase](docs/SETUP.md)
- [Railway staging](docs/RAILWAY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Properties v0.3](docs/PROPERTIES-v0.3.md)
- [Reservations v0.4](docs/RESERVATIONS-v0.4.md)
- [Reservations hardening v0.4.1](docs/RESERVATIONS-v0.4.1.md)
- [Validations](docs/VALIDATION.md)

## Sécurité et versioning

- les fichiers `.env*` sont ignorés, sauf `.env.example` sans valeur ;
- aucune clé `service_role`, URL PostgreSQL avec mot de passe ou credential de déploiement ne doit être commitée ;
- les migrations déjà appliquées sont immuables : toute évolution de schéma doit être une nouvelle migration ;
- les données de production, comptes Auth et objets Storage ne font pas partie du repository.
