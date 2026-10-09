# HostFlow sur Railway — staging

Railway héberge le serveur Next.js natif sur Node.js. Supabase conserve Auth, PostgreSQL et le bucket privé `property-photos`. Le frontend, les API, les permissions et les migrations existantes restent identiques. Aucun PostgreSQL Railway ni volume persistant n’est requis.

Cette étape utilise `codex/railway-migration`. Le déploiement ChatGPT Sites, sa configuration `.openai/hosting.json` et la production restent en place. Les anciens rapports de validation décrivent leurs déploiements historiques.

## Commandes

| Étape        | Commande                         |
| ------------ | -------------------------------- |
| Installation | `pnpm install --frozen-lockfile` |
| Build        | `pnpm build`                     |
| Démarrage    | `pnpm start`                     |

Le `packageManager` fixe pnpm à `11.25.0`. Utiliser Node.js 24 pour Railway. L’installation doit inclure les dépendances de développement : le build exécute `pnpm typecheck`, `pnpm test`, puis `next build`. Le lancement utilise `next start`, écoute sur `0.0.0.0` et lit `PORT`, fourni par Railway ; le port local par défaut est `3000`.

Railpack détecte le projet grâce à `package.json` et au lockfile. La configuration du service suffit ; aucun Dockerfile ni fichier de configuration Railway n’est nécessaire.

## Variables du service staging

Renseigner ces variables dans Railway → service HostFlow → Variables, dans l’environnement `staging`. Les noms et les valeurs non sensibles sont également documentés dans `.env.example`.

| Variable                   | Valeur à renseigner                                                        |
| -------------------------- | -------------------------------------------------------------------------- |
| `SUPABASE_URL`             | URL HTTPS du projet Supabase conservé.                                     |
| `SUPABASE_PUBLISHABLE_KEY` | Clé publishable du projet, ou ancienne clé `anon`.                         |
| `APP_URL`                  | Origine HTTPS exacte du domaine staging, sans chemin ni slash final.       |
| `NODE_ENV`                 | `production` : mode du runtime, même pour l’environnement Railway staging. |
| `RAILPACK_NODE_VERSION`    | `24`                                                                       |
| `RAILPACK_INSTALL_CMD`     | `pnpm install --frozen-lockfile`                                           |

Ne pas définir manuellement `PORT`. Aucun `NEXT_PUBLIC_*`, `DATABASE_URL`, mot de passe PostgreSQL, clé Supabase secrète ou `service_role` n’est nécessaire. Les trois variables applicatives sont lues côté serveur à l’exécution ; un build peut réussir sans backend configuré.

Si staging réutilise le projet Supabase actuel, il partage ses comptes, ses données et son Storage. Un environnement Railway séparé ne sépare pas la base. La migration n’exécute ni `db push`, ni reset, ni modification de policy.

## Déploiement depuis GitHub

1. Publier la branche `codex/railway-migration` dans `Adyo-Team/Hostflow` après revue des changements. Ne pas committer `.env.local` ni les identifiants de gestion.
2. Créer un projet Railway vide pour HostFlow. S’il comporte un environnement `production` par défaut, créer un environnement vide `staging` via Settings → Environments et le sélectionner avant de créer un service. Laisser la production vide.
3. Dans `staging`, ajouter le service Node depuis le repository GitHub `Adyo-Team/Hostflow`. Autoriser ce repository dans l’intégration GitHub si nécessaire. Configurer la branche source sur `codex/railway-migration`.
4. Dans Settings du service, choisir Railpack, Root Directory `/`, Build Command `pnpm build` et Start Command `pnpm start`. Le `package.json` est à la racine Git ; le nom local `hostflow-website` ne doit pas devenir un sous-dossier Railway.
5. Renseigner les variables ci-dessus. Dans Networking → Public Networking, générer un domaine Railway ; reporter son origine HTTPS dans `APP_URL`.
6. Vérifier que les modifications sont limitées à `staging`, puis lancer le déploiement. Contrôler l’installation, les checks, la compilation et le démarrage dans les logs. Attendre le statut réussi avant la recette HTTP.
7. Ajouter les callbacks staging à Supabase comme décrit ci-dessous, puis effectuer la recette Auth. Conserver la branche `main`, les domaines de production et le déploiement Sites actuels.

Les déploiements automatiques éventuels doivent suivre uniquement la branche de migration dans `staging`. La bascule de production demande une validation séparée.

## Supabase Auth, cookies et redirections

Dans Supabase → Authentication → URL Configuration, conserver la Site URL existante et les Redirect URLs déjà utilisées par Sites. Ajouter les deux destinations exactes du staging, en remplaçant `<domaine-staging>` par le domaine généré :

```text
https://<domaine-staging>/auth/confirm
https://<domaine-staging>/auth/confirm?flow=recovery
```

HostFlow fournit ces destinations explicitement lors de l’inscription et de la récupération. Les redirections finales restent `/welcome`, `/reset-password` ou `/login?error=confirmation` sur l’origine configurée dans `APP_URL`.

Les cookies Supabase conservent `HttpOnly`, `SameSite=Lax` et `Path=/`. Ils sont `Secure` quand `APP_URL` est HTTPS et restent propres au domaine du navigateur. Les sessions Sites ne sont pas transférées au domaine staging : reconnecter le compte sur Railway. Le proxy et les API vérifient les sessions ; les cookies d’organisation ne donnent aucune autorisation à eux seuls.

Les mutations contrôlent `Origin` face à `APP_URL`. Une mauvaise origine entraîne un refus : garder l’URL publique HTTPS, même si Railway termine TLS devant le processus Node. Ne pas remplacer `APP_URL` par une adresse interne ou par l’URL Supabase.

Vérifier également les modèles email Supabase : `{{ .SiteURL }}` renvoie au site principal, alors que `{{ .RedirectTo }}` contient la destination demandée. Dans HostFlow, cette dernière inclut déjà le chemin du callback et peut inclure une query de récupération. Un remplacement mécanique peut donc produire un double chemin ou un second `?`. Les modèles sont partagés au niveau du projet Supabase : ne pas les modifier pour ce staging sans valider l’effet sur Sites. Si un modèle fixe encore la destination sur Sites, la confirmation/récupération email staging reste à valider ; un projet Supabase séparé permet de tester ses propres réglages sans changer la production.

Le callback accepte PKCE `code` et les OTP `token_hash` de type `email` ou `recovery`. PKCE exige le navigateur qui a initié la demande. Une compilation ou une réponse HTTP du callback ne certifie pas la livraison d’un email ni une session réelle.

## Recette

Exécuter localement `pnpm typecheck`, `pnpm test`, `pnpm build` et `pnpm test:production`, puis démarrer avec `pnpm start`. Le smoke test de production vérifie le runtime HTTP sans identifiants Supabase. Pour le test local connecté, les trois variables applicatives vont dans `.env.local`, avec `APP_URL=http://localhost:3000`. Retirer les variables Railway et laisser Next.js gérer `NODE_ENV` en développement.

Après déploiement, vérifier `/login`, `/signup`, les routes principales et les API `/api/hostflow`, `/api/properties`, `/api/reservations`, `/api/tasks`. Une requête anonyme sur une API métier doit être refusée ; `/api/hostflow` doit renvoyer un workspace vide avec `configured: true` quand Supabase est configuré. Le contenu de session doit rester `no-store`.

Compléter avec un compte de test confirmé : connexion, rechargement d’une page privée, rafraîchissement et déconnexion ; puis Organizations, Properties, photos privées, Reservations, Calendar et Tasks avec les permissions existantes. Vérifier séparément les emails de confirmation et récupération et leur destination. Les tests PostgreSQL embarqués ne remplacent pas cette recette Auth/Storage distante.

## Validation de la migration — 9 octobre 2026

- Installation gelée `pnpm install --frozen-lockfile` : réussie.
- `pnpm typecheck` : réussi.
- `pnpm test` : 119 tests réussis, aucun échec ni test ignoré.
- `pnpm build` : compilation Next.js 16.3.4 réussie, API dynamiques et proxy inclus.
- `pnpm test:production` : 33 vérifications HTTP réussies sur le serveur Node compilé, avec un port injecté et une origine canonique HTTPS. Configuration Supabase factice locale ; ces tests ne valident pas une session Supabase réelle, les emails ni Storage.

Projet Railway : [HostFlow](https://railway.com/project/157732c3-1a4c-4a6b-a169-f39833f98c08), environnement `staging`, service `hostflow-staging`. Domaine réservé : `https://hostflow-staging-staging.up.railway.app`. La réservation du domaine seule ne prouve pas un déploiement réussi.

Les variables publiques de connexion utilisent le backend HostFlow existant. La clé `SUPABASE_PUBLISHABLE_KEY` n'est pas accessible depuis la configuration Sites (valeur masquée) ; elle doit être renseignée directement dans Railway. Sans elle, l'application affiche son état de configuration existant et ne permet pas la connexion. Aucun réglage Auth partagé, migration ou donnée distante n'a été modifié.

## Sources de configuration

- [Railpack : Node.js et détection pnpm](https://railpack.com/languages/node/)
- [Railpack : variables de commandes](https://railpack.com/config/environment-variables/)
- [Railway : environnements](https://docs.railway.com/environments)
- [Railway : déploiements GitHub](https://docs.railway.com/deployments/github-autodeploys)
- [Supabase : redirections Auth](https://supabase.com/docs/guides/auth/redirect-urls)
- [Supabase : modèles email](https://supabase.com/docs/guides/auth/auth-email-templates)
