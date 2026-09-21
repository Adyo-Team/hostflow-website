# HostFlow

HostFlow est un SaaS B2B multi-tenant destiné aux conciergeries de location courte durée. La version actuelle (`v0.4.1`) comprend l’authentification, les organisations et rôles, l’équipe, les logements, les photos privées, les réservations manuelles et les blocages de disponibilité.

Chaque conciergerie est une `Organization`. L’isolation des données est assurée dans PostgreSQL par les memberships, les rôles et la Row Level Security (RLS). Les conflits de réservation utilisent des intervalles `[arrivée, départ)` et une contrainte d’exclusion PostgreSQL transactionnelle.

## Stack technique

- Next.js 16 App Router, React 19 et TypeScript ;
- Tailwind CSS 4 et composants shadcn ;
- Supabase Auth, PostgreSQL, Storage et Edge Functions ;
- Vinext/Vite et Cloudflare Workers pour l’hébergement Sites ;
- pnpm 11 avec lockfile versionné ;
- Node.js 22.13 minimum.

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
scripts/                 Installation, build et adaptation Sites
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

## Développement local

Le mode Next.js natif est le chemin le plus simple pour développer localement :

```bash
pnpm dev:next
```

Ouvrir `http://localhost:3000`. `APP_URL` doit être exactement cette origine. Le runtime portable utilisé par l’hébergement peut aussi être lancé avec `pnpm dev` ; il écoute par défaut sur le port `5173`, auquel cas il faut adapter `APP_URL`.

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

`pnpm build` exécute également le typecheck et les tests avant le build Vinext de production. Le build Next.js natif reste disponible avec `pnpm build:next`.

Après un build portable réussi :

```bash
pnpm start
```

## Documentation

- [Mise en service Supabase](docs/SETUP.md)
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
