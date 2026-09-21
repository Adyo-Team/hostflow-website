# Mise en service de HostFlow

## Statut du raccordement

Le projet Supabase `hostflow` (`zwcrmcuptrccglkijfls`) est raccordé. Les six migrations versionnées, jusqu’à `20260921140121_reservations_core`, sont appliquées. Elles couvrent le socle Organizations/Memberships/Roles, Properties, Reservations, Property Blocks, la RLS et la protection transactionnelle contre les chevauchements. Les variables serveur de HostFlow pointent vers ce projet ; aucune clé privilégiée n’est utilisée dans l’application.

La RLS a été testée sur PostgreSQL distant puis avec les vrais JWT de trois comptes Auth de test explicitement autorisés. Connexions, invitations, rôles, retrait, isolation Alpha/Beta et restauration des cookies sur une route privée ont réussi. Les comptes de test et leurs données ont été supprimés en préservant les comptes existants. L’API Auth est accessible, les inscriptions email sont activées et la confirmation email est obligatoire. La livraison et l’ouverture des emails de confirmation/récupération restent à vérifier.

Le connecteur permet les migrations mais ne propose pas de réglage Auth URL/SMTP ni de création de comptes Auth. La CLI n’a pas de jeton de gestion configuré. Vérifier les URL et le SMTP directement dans le dashboard Supabase avant la validation des inscriptions ; ne pas désactiver la confirmation email pour contourner cette étape.

## Raccorder le projet Supabase

1. Projet sélectionné et inspecté : `zwcrmcuptrccglkijfls`, région `eu-west-1`. Réutiliser ce projet, sans réappliquer les migrations déjà enregistrées.
2. Les fichiers de `supabase/migrations/` portent les mêmes versions que l’historique distant et sont immuables. `pgcrypto` et `btree_gist` sont présents dans `extensions`.
3. Dans Auth → URL Configuration, vérifier Site URL = `https://hostflow.jeeddd.chatgpt.site` et les Redirect URLs `https://hostflow.jeeddd.chatgpt.site/auth/confirm` et `https://hostflow.jeeddd.chatgpt.site/auth/confirm?flow=recovery`. Maintenir la confirmation email active.
4. Configurer un SMTP de production avec votre domaine pour les confirmations et récupérations. Les invitations d’équipe du socle génèrent un lien à copier ; elles n’envoient aucun email.
5. Les variables **serveur** suivantes sont configurées dans l’hébergement :

| Variable                 | Valeur attendue                                             |
| ------------------------ | ----------------------------------------------------------- |
| SUPABASE_URL             | URL HTTPS du projet Supabase                                |
| SUPABASE_PUBLISHABLE_KEY | Clé publishable, ou ancienne clé anon ; jamais service_role |
| APP_URL                  | Origine HTTPS exacte de HostFlow, sans slash final          |

En développement natif : copier `.env.example` en `.env.local` puis renseigner ces valeurs. Pour Next.js local, APP_URL doit correspondre exactement à l’origine du navigateur. Ne pas utiliser la même configuration d’origine entre un environnement local et la production. Les cookies Secure sont désactivés uniquement pour une origine locale HTTP.

## Confirmation email et récupération

Le callback prend en charge le flux PKCE `?code=…` de Supabase. L’utilisateur doit ouvrir le lien dans le navigateur ayant initié la demande. Pour les confirmations sur un autre appareil, adapter les modèles email Supabase à l’URL `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`. Pour la récupération, utiliser `type=recovery`. Le serveur valide le jeton via Supabase puis redirige vers une destination fixe. Ne jamais insérer le token dans les logs.

Après confirmation, l’utilisateur arrive sur `/welcome`. Son compte et son profil existent indépendamment de toute organisation. Il peut ouvrir ou coller une invitation pour rejoindre une équipe, ou attendre une invitation. Seul un responsable souhaitant créer sa conciergerie choisit `/onboarding` ; cette transaction crée également son premier owner. Le compte peut ensuite appartenir à plusieurs organisations et passer de l’une à l’autre via le sélecteur.

## Commandes de développement

Le projet utilise pnpm et son lockfile. Node 22.13 minimum, Node 24 testé.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev:next
pnpm build:next
pnpm start:next
```

Une stack Supabase locale reproductible est également configurée :

```bash
pnpm exec supabase start
pnpm exec supabase db reset
```

La deuxième commande est destructive uniquement pour la base locale. Ne jamais ajouter `--linked` contre la production. Le seed versionné est volontairement vide et ne contient aucune donnée utilisateur.

Le runtime Sites possède ses propres commandes `dev` / `build` basées sur Vinext. Les pages suivent Next.js App Router ; le backend est indépendant du runtime d’hébergement. Ne pas relancer un initializer sur ce projet.

## Vérifications avant activation réelle

- Inscription → email de confirmation → accueil personnel → invitation ou création volontaire de l’organisation.
- Invitation d’une deuxième adresse → inscription / confirmation → acceptation → rôle attendu.
- Connexion / déconnexion / expiration et rafraîchissement de session.
- Récupération réelle du mot de passe et ouverture depuis un second navigateur.
- Deux organisations réelles de test, requêtes Supabase directes avec leurs JWT : lectures et écritures croisées refusées.
- Deux changements concurrents visant les derniers owners : au moins un owner doit subsister. PostgreSQL embarqué ne teste pas cette concurrence multiprocessus.
- Révocation d’un membre avec une session déjà ouverte : prochaine requête refusée.
- Rate limits, CAPTCHA et SMTP configurés ; ne pas considérer une interface de formulaire comme une preuve d’envoi.

## Stockage, temps réel et intégrations

Aucun bucket public, aucune clé OTA et aucun connecteur fictif. Storage est activé pour le bucket privé `property-photos`, avec ses policies multi-tenant ; voir [PROPERTIES-v0.3.md](PROPERTIES-v0.3.md). Realtime reste à venir. Ne pas activer une publication Realtime générale sur les données privées. Les canaux Realtime futurs doivent être privés et les abonnements contrôlés par tenant.

## Décisions d’exploitation

Le registre `private.platform_admins` ne confère aucun accès implicite aux tenants et n’est pas exposé par l’API. Son alimentation doit rester une opération d’administration contrôlée ; aucun bouton pour se promouvoir en Super Admin. Un outil plateforme et les accès support sont hors du lot actuel.

Migrations appliquées immuables : ajouter une migration compatible pour les évolutions. Les accès, Wi-Fi et notes des logements sont privés dans Properties. Les documents et données voyageurs restent à venir. Il faudra les séparer des projections publiques au moment de leur ajout.

## Test de bout en bout réel, après raccordement

Exécution réussie le 14 septembre 2026 via Next.js natif connecté au projet Supabase. Les comptes ont été confirmés administrativement pour ce test autorisé ; cette exécution ne prouve pas la livraison des emails. Le provisionneur temporaire `foundation-qa` a été remplacé immédiatement par une réponse HTTP 410 sans client administratif. Il ne peut plus créer de compte.

`node tests/live-foundation.mjs` n’utilise que Supabase Auth et l’API HostFlow réels. Sans configuration il échoue immédiatement ; il ne bascule jamais sur un mock.

Variables de test (hors Git) : `HOSTFLOW_TEST_ORIGIN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, puis `HOSTFLOW_TEST_A_EMAIL`/`PASSWORD`, `HOSTFLOW_TEST_B_EMAIL`/`PASSWORD`, `HOSTFLOW_TEST_MEMBER_EMAIL`/`PASSWORD` (chacun avec le préfixe complet HOSTFLOW_TEST_). Utiliser trois adresses de test distinctes que vous contrôlez et dont l’email a été confirmé. Sur un Site privé, exécuter depuis une origine autorisée à atteindre l’application, ou utiliser une instance locale connectée au même projet Supabase.

Une première exécution avec `HOSTFLOW_TEST_SIGNUP=true` soumet les inscriptions réelles ; confirmer les emails, puis relancer sans ce drapeau. Le test vérifie owner, invitation, permissions, requêtes RLS directes avec la clé publique et le JWT de B, falsification du cookie d’organisation, reconnexion et accès direct à `/team`. Aucun secret n’est affiché. Les organisations QA sont conservées pour inspection ; les sessions de test sont fermées.

Les essais navigateur authentifiés desktop/mobile et la concurrence réelle du dernier owner restent séparés. Ne pas marquer l’acceptation terminée avant ces essais.
