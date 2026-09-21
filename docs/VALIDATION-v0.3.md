# Validation — Properties v0.3

Exécutée le 14 septembre 2026. Projet Supabase distant : HostFlow `zwcrmcuptrccglkijfls`. Les données utilisateur existantes sont conservées.

## Automatisation locale

`pnpm test` : **70 tests réussis**, zéro échec. Dont 20 tests du modèle Properties et de ses permissions, et un test du générateur UUID sécurisé sur aperçu HTTP. Les tests SQL appliquent la chaîne complète des cinq migrations ; la suite de compatibilité v0.2 conserve son périmètre de trois migrations.

Vérifiés : contraintes et FK, équipements transactionnels, reprise idempotente, conflits d’édition PT409, interdiction de déplacer tenant/auteur, restriction owner/admin/manager/staff, archive/restauration, suspension immédiate, image cover/ordre/suppression, RLS des lignes et des objets, bucket privé, grants et SECURITY INVOKER, index et absence de secrets dans l’audit.

PGlite reproduit la structure de métadonnées Storage. Il ne remplace pas les essais de vrais uploads et téléchargements ci-dessous.

TypeScript strict et compilation Next.js native : réussis. ESLint : zéro erreur ; neuf avertissements préexistants sur les navigations complètes du socle Auth/équipe/accueil, conservées pour ne pas modifier inutilement l’authentification.

## Acceptation distante réelle

**23 contrôles réussis** dans `tests/live-properties.mjs` via le serveur Next natif : comptes Supabase Auth A, B et MEMBER réels, organisations QA Alpha et Beta, invitation et adhésion manager. Compte personnel sans création imposée d’organisation également contrôlé.

- Création, liste, détail, édition manager et équipements persistés.
- Réponse de conflit d’édition 409 ; reprise de création sans doublon.
- Trois vrais fichiers PNG envoyés à Storage ; ordre et couverture modifiés ; octets téléchargés comparés au fichier source.
- Test critique : B ne voit aucune ligne Alpha par requête Supabase directe ; ne peut lister, télécharger, envoyer ni effacer ses fichiers. L’API refuse également les IDs Alpha associés à Alpha ou à Beta.
- Manager ne peut archiver ; passage à staff bloque immédiatement l’API, les tables et Storage avec le JWT déjà ouvert.
- Contenu SVG déguisé en PNG et fichier >5 MiB refusés.
- Recherche, filtres, pagination, archivage, restauration, suppression réelle des photos et reconnexion : réussis. La route privée `/properties/[id]` retourne 200 après reconnexion avec la bonne organisation restaurée.

Les comptes QA sont confirmés administrativement, sans envoi d’email. Cela ne prouve pas la livraison SMTP. Le provisionneur temporaire `properties-qa` a été fermé avec une réponse HTTP 410 sans client administratif ; le nonce initial a été testé après fermeture et supprimé.

## Runtime d’hébergement

Compilation Vinext/Worker réussie. Le test local `tests/run-properties-worker.mjs` ne peut pas atteindre Supabase : le runtime workerd rencontre une erreur DNS dans cet environnement. Aucun contournement réseau ni modification de l’authentification. Le même smoke test HTTP `tests/live-properties-worker.mjs` est prévu sur la version publiée ; son résultat est indiqué dans le rapport de livraison.

## Contrôle visuel

Navigateur Chrome, surfaces de 390, 768 et 1440 px. Copies isolées des composants de production avec un transport en mémoire explicitement signalé « contrôle visuel — données de test locales ». Aucune désactivation de l’authentification ou de la RLS, aucune injection de session. Ce contrôle visuel complète les tests réels de l’API ; il ne constitue pas un parcours navigateur connecté de bout en bout.

Contrôlés : formulaire en six étapes, saisie et conservation entre étapes, blocage d’une commission à 101 %, sélection d’équipements, galerie sur mobile, sélection de plusieurs fichiers via le sélecteur natif, changement de cover/ordre, confirmation de suppression, carte logement, filtres et fiche, confirmation d’archivage, onglets futurs. Largeurs mesurées sans débordement horizontal sur mobile et tablette. Images chargées et boutons accessibles. Les pages et copies temporaires ont été supprimées avant publication.

Une erreur `crypto.randomUUID` limitée à l’aperçu HTTP a été corrigée avec un repli cryptographique `getRandomValues`, puis vérifiée à nouveau dans le navigateur et par un test dédié. Aucune nouvelle erreur de console de l’application après correction ; les erreurs de l’extension du navigateur sont externes au site.

## Correctif découvert pendant les essais réels

Un conflit métier levé en SQLSTATE 40001 faisait boucler PostgREST 14. Migration additive `20260914101639_properties_conflict_responses` : remplacement par PT409 dans les trois RPC concernées, sans changement de leurs grants ou de la RLS. Le test distant renvoie ensuite 409 en moins d’une seconde. Aucune requête Properties bloquée restante dans `pg_stat_activity` au contrôle suivant.

Référence : [diagnostic officiel Supabase](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

## Points d’exploitation

- Les advisors ne signalent aucun défaut de sécurité sur Properties/Storage. Le registre privé `platform_admins` est volontairement fermé. Les nouveaux index encore inutilisés sont conservés pour le portefeuille futur.
- Avertissement Auth préexistant : protection contre les mots de passe compromis désactivée. Aucun réglage Auth n’a été changé dans ce lot.
- Le parcours navigateur authentifié complet n’a pas été exécuté : la connexion navigateur exige une saisie sécurisée de l’utilisateur. Les sessions, permissions, routes et écritures réelles sont testées par HTTP, les interactions visuelles séparément.
- Owner de logement réservé au futur module Owners ; staff sans accès global tant que les affectations opérationnelles n’existent pas.
- Photos limitées à JPEG/PNG/WebP, 5 MiB, 30 par logement ; pas de compression ni de HEIC. Transferts interrompus visibles et récupérables ; pas de worker de purge périodique dans ce lot.
