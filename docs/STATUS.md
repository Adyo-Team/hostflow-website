# HostFlow — état actuel

Version fonctionnelle : **v0.6 — Operations / Tasks**.

État vérifié dans le repository le 26 septembre 2026, après le commit `4b09dfa` (`chore: initialize Codex project workflow`), avec les métadonnées alignées sur v0.6. Le code fait foi ; les anciens rapports documentent leurs validations historiques, pas l'état actuel du déploiement.

## Architecture et stack

Monolithe modulaire multi-tenant : une `Organization` correspond à une conciergerie.

- Next.js 16.3.4 App Router, React 19.2.6, TypeScript 5.9.3 en mode strict.
- Tailwind CSS 4.2.1, primitives shadcn/Base UI/Radix et composants HostFlow partagés ; Zod pour la validation.
- Supabase Auth, PostgreSQL et Storage privé ; clients `@supabase/ssr` 0.12.6 et `@supabase/supabase-js` 2.115.0. Pas de client applicatif privilégié `service_role`.
- Vinext 1.0.0-beta.5, Vite 8.0.13 et Cloudflare Workers/Wrangler pour le runtime Sites. Commandes Next.js natives disponibles séparément.
- Node.js >= 22.13.0 ; pnpm 11.25.0 déclaré avec lockfile. Vérifications locales effectuées sous Windows avec Node.js 24.20.0.
- Tests via `node:test`, avec PostgreSQL embarqué PGlite pour les migrations et les contrôles SQL.

`app/` porte les pages et route handlers ; `components/hostflow/` les écrans métier et le workspace partagé ; `components/ui/` les primitives ; `lib/` les types, validations, services serveur et clients Supabase. `supabase/` contient migrations, configuration locale, seed et fonctions QA. `tests/` contient tests automatisés et scripts de validation distante distincts.

Les API valident la session, l'organisation active, les rôles et les entrées. Les mutations contrôlent l'origine. La base applique RLS, contraintes et triggers ; les relations métier utilisent des clés composites pour empêcher les associations entre tenants. Les fonctions privilégiées sont encadrées dans le schéma privé. Le registre privé d'occupation et son exclusion GiST arbitrent les conflits sur des intervalles de séjour semi-ouverts.

## Modules présents / socle stable

« Stable » désigne ici le périmètre implémenté et couvert par les tests locaux ; cela ne certifie pas une recette complète en production.

| Module | Périmètre existant |
| --- | --- |
| Auth | Inscription, confirmation, connexion, récupération/changement du mot de passe, déconnexion, sessions en cookies et profil personnel. |
| Organizations | Création volontaire, paramètres et changement d'organisation dans un workspace partagé. |
| Memberships | Appartenances par organisation, statut actif/suspendu et retrait sans suppression du compte. |
| Roles / permissions | Autorité existante en base et contrôles serveur, owner/admin/manager/staff, protection du dernier owner ; rôles property_owner/guest réservés. |
| Team | Liste des membres, invitations par lien, gestion des rôles/statuts et étape de configuration d'équipe. |
| Properties | Liste filtrée/paginée, création, édition, détail, équipements, galerie privée, archivage/restauration et gestion des conflits de version. |
| Reservations | Réservations manuelles, filtres, détail, édition, annulation et prévention transactionnelle des chevauchements. Intervalles `[check_in, check_out)`. |
| Property Blocks | Blocages manuels, édition et libération ; même registre d'occupation que les réservations. |
| Calendar | Projection des logements, réservations confirmées et blocages actifs ; vues 7/14/31 jours, pagination et liens vers les formulaires. Pas de déplacement/redimensionnement par glisser-déposer. |
| Operations / Tasks | Route `/tasks`, API et table `tasks` : tâches manuelles de ménage, check-in/out, maintenance et internes ; logement, réservation facultative, affectation, date, priorité et statut. Staff limité à ses tâches assignées et aux changements de statut autorisés. |
| Design system unifié | Shell partagé, primitives UI, Button/PageHeader/FilterBar/StatusBadge/Pager, états de chargement et tokens CSS communs. |

Le dashboard existant affiche notamment le socle organisation/équipe, la progression et l'audit. Les panneaux arrivées, départs et ménages restent des états d'attente : le dashboard opérationnel n'est pas livré. Les propriétaires, le CRM voyageurs, les connecteurs OTA/iCal et les automatisations métier ne sont pas implémentés. Les coordonnées voyageurs d'une réservation ne constituent pas un CRM. Les tâches ne sont pas générées automatiquement.

## Migrations versionnées

Sept migrations sont présentes ; aucune modification de Supabase n'a été effectuée lors de cet état des lieux.

| Migration | Apport |
| --- | --- |
| `20260914003227_foundations.sql` | Organisations, adhésions initiales, invitations, audit, RLS et fonctions du socle. |
| `20260914003249_foundation_roles.sql` | Évolution des rôles. |
| `20260914003309_foundation_v02.sql` | Memberships v0.2, profils, owner et renforcement des permissions. |
| `20260914092103_properties_v03.sql` | Logements, équipements, images, Storage privé, RLS et RPC. |
| `20260914101639_properties_conflict_responses.sql` | Réponses de conflit Properties adaptées. |
| `20260921140121_reservations_core.sql` | Réservations, blocages, registre privé d'occupation, exclusion GiST et RLS. |
| `20260924224638_operations_tasks.sql` | Tâches, relations tenant/logement/réservation/membre, RLS, restrictions staff et audit. |

La présence des migrations dans Git ne prouve pas leur application distante. L'historique distant, notamment l'application de Tasks, n'a pas été contrôlé dans cette tâche.

## Vérifications locales

Résultats du 26 septembre 2026 :

| Commande | Résultat |
| --- | --- |
| `pnpm typecheck` | Réussi. |
| `pnpm test` | 119 tests réussis, aucun échec ni test ignoré. |
| `pnpm build` | Réussi sous Windows : checks pnpm intégrés puis compilation de production Vinext terminée, code de sortie 0. |

Le build signale des avertissements non bloquants sur le temps passé dans les plugins et la classification statique de certaines routes. Aucun échec de compilation.

Les tests couvrent notamment l'isolation des tenants, les rôles, invitations et profils, Properties/Storage, les conflits réservations/blocages, Calendar, Tasks et la gestion du workspace. Les suites PGlite exécutent les migrations avec un contrat Auth de test ; elles ne remplacent pas des sessions Supabase réelles, la concurrence multiprocessus ou la recette navigateur.

Non exécutés dans cette tâche : tests distants/SQL distants, parcours navigateur, livraison des emails Auth, build Next.js natif et lint. Aucun déploiement ni changement de base.

## Problèmes et limites constatés

- Aucun `.env.local` ni variable `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL` détectés dans l'environnement inspecté. Le développement connecté à Supabase n'est pas configuré ici.
- `proxy.ts` omet `/tasks` dans son matcher et sa liste de pages privées. Le shell effectue une redirection client, et l'API Tasks ainsi que la RLS vérifient toujours les accès ; ce constat ne démontre pas une exposition des données.
- `package.json` (0.6.0) et l'introduction du README sont alignés sur v0.6. Certaines sections de l'ancienne documentation d'architecture et la roadmap de l'interface décrivent encore des modules livrés comme futurs.

`AGENTS.md` est désormais versionné. Le lanceur `scripts/run-framework.mjs` exécute les checks via le point d'entrée pnpm avec Node, sans dépendre des scripts de lancement Windows de npm.

L'environnement permet de travailler sur le code. La configuration Supabase reste à traiter pour le développement connecté ; la compilation locale ne valide pas la connexion à la base distante.

## Prochaine milestone

**v0.7 — Dashboard opérationnel**, à construire sur les modules et permissions existants. Voir [ROADMAP.md](ROADMAP.md). Aucun développement de cette milestone n'est inclus dans cette mise en place documentaire.
