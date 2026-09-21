# HostFlow v0.3.1 — journal de stabilisation

## Reproduction sur la publication v7, 14 septembre 2026

Compte existant connecté par le propriétaire via la reprise manuelle sécurisée.
Aucune session injectée et aucun changement d’authentification ou de RLS.

- Dashboard → Logements : le document recharge, l’organisation revient à vide,
  « Aucun espace créé » et un bouton Logements désactivé apparaissent avant le
  retour des données. Cause : un contrôleur useWorkspace neuf dans chaque page.
- Ajouter un logement ouvre le formulaire en un clic avec le lien documentaire
  de v7 ; celui-ci avait remplacé next/link sans résoudre le défaut du routeur.
- Le lien du logo, resté en next/link, reproduit le blocage : à 13:19:32 UTC,
  `TypeError: e is not a function`, chunk `shared-DmZBbSAk.js:42:93015`.
  Aucune requête de navigation ne part. Le module chargé dynamiquement ne
  possède pas l’export `navigateClientSide` attendu par Link. Les exports ont
  disparu lors de la fusion dans l’entrée du navigateur du build Vinext.
- Annulation avec confirmation, création réelle en six étapes, deux uploads
  PNG, changement de cover, fiche, édition et remplacement d’équipements réussis.
- La galerie affiche « Aucune photo » pendant le chargement ou le premier
  upload : `data?.images ?? []` confond absence de réponse et galerie vide.
- Back/Forward vers la fiche et la galerie fonctionne sur v7, avec rechargement
  visible de l’espace à chaque transition.

## Corrections

- Le build émet explicitement le module de navigation avec sa signature
  conservée. Aucun patch de node_modules ni repli silencieux sur des liens natifs.
  La seule option globale preserveEntrySignatures n’était pas suffisante et
  n’a pas été conservée. Le test du bundle échoue sur v7 et passe après correction.
- WorkspaceProvider appartient au layout racine ; les pages partagent le même
  état vérifié, avec les rafraîchissements existants et la même validation serveur.
- Les liens internes utilisent le routeur corrigé. Les permissions ne sont plus
  réinitialisées entre pages ; le premier chargement affiche un état explicite.
- Suppression de propertiesListOverride et des écritures history.replaceState
  qui dissociaient l’URL et la vue. Le routeur gère les changements et les clés
  de formulaire incluent organisation, vue et identifiant du logement.
- La galerie distingue chargement, transfert, erreur et absence réelle de photos.
- Les choix de ville restent disponibles pendant un changement de recherche,
  sans afficher les anciens résultats comme actuels. Les données précédentes
  ne peuvent jamais traverser un changement d’organisation.
- La sauvegarde et l’archivage rafraîchissent les chiffres du dashboard en
  arrière-plan ; ils n’exigent pas de recharger le document.
- Les erreurs DB imprévues indiquent l’opération et le code dans les logs serveur,
  sans valeurs, requêtes SQL, identités ni secrets.

## Erreur serveur historique

Le 500 GET /api/hostflow de 12:11:06 UTC, requête
`8b12dc1fa51062f2599259758ba4765b`, n’a pas de cause établie.
Il n’est pas considéré résolu. Les logs disponibles lors de cette reprise
montrent des lectures et mutations réussies ainsi que des requêtes annulées
lors de navigations ; une annulation ne constitue pas un HTTP 500.
La nouvelle attribution des erreurs à une opération permettra de poursuivre
le diagnostic si cet incident revient.

## Tests automatisés

- 78 tests unitaires/SQL réussis le 14 septembre 2026 ; TypeScript strict réussi,
  lint sans erreur (9 avertissements préexistants).
- Contrat du bundle de production obligatoire dans le script de build.
  Il échoue sur le bundle défectueux et passe avec l’export conservé.
- Tests du contrôleur partagé et des diagnostics sans fuite de données.
- Tests des données précédentes : maintien des facettes, isolation entre
  organisations. Les tests SQL existants couvrent les rôles, RLS et Storage.
  Ils exécutent les migrations dans PostgreSQL via PGlite ; cette reprise ne
  constitue pas un nouveau test avec deux comptes sur le Supabase distant.
- Scénarios réutilisables du navigateur dans `tests/browser-properties-flow.mjs`.
  Ils attendent l’URL et le contenu de destination avant le clic suivant.
  Le scénario de navigation corrigé a été exécuté avec succès sur la publication.
- Le nouveau scénario de création complète a également réussi sur la publication :
  six étapes, équipement, enregistrement, fiche, actualisation et apparition
  dans la liste. Son troisième logement QA a ensuite été archivé. Le contrôle
  des uploads et de la cover est réalisé dans les parcours manuels détaillés ci-dessous.

## Parcours réels sur la publication corrigée

Publication Sites v8, source `0b731f99e1d0132782aaa6e8bcd6ff99670a8161`,
mise en ligne à 13:36:49 UTC. Les essais utilisent le site publié, les API
réelles et la session habituelle, sans injection de cookies ni fausses réponses.

| Contrôle | Résultat observé |
| --- | --- |
| Logo puis Dashboard → Logements → Équipe → Logements | Liens fonctionnels, organisation conservée, aucune entrée Logements disparue |
| Ajouter un logement | Formulaire visible en un clic, y compris après plusieurs navigations |
| Annuler un formulaire modifié | Confirmation unique, retour liste, aucune création |
| Création en six étapes sur mobile | Logement enregistré, données retrouvées dans la fiche |
| Photos | Deux PNG envoyés, visibles dans la galerie et dans la fiche ; changement de photo principale enregistré |
| Édition | Nom prérempli, changement de nom et d’équipements enregistré ; ajout/retrait d’équipements également contrôlé sur le parcours desktop avant publication du correctif |
| Recherche et filtres | Recherche du nom, ville, statut et type corrects ; Maison produit zéro résultat, Appartement retrouve le logement |
| Archivage | Deux logements QA archivés avec confirmation ; équipements et photos conservés ; filtre Archivés les retrouve |
| Actualisations directes | Dashboard, liste, création, fiche et édition restaurés avec la bonne session et organisation |
| Back/Forward | Retour de l’édition vers la fiche, puis de nouveau vers l’édition, avec les bonnes données |
| Déconnexion | Retour connexion ; accès direct à une fiche privée redirigé vers /login |
| Reconnexion | Connexion réelle via saisie sécurisée ; organisation et logements retrouvés puis conservés après actualisation |
| Dashboard | Compteur revenu à un logement actif après archivage des deux logements QA |

### Responsive et observations

- Desktop contrôlé dans le navigateur ; mobile contrôlé à 390 px via
  `/__checks/responsive.html`, qui affiche la véritable application dans une
  iframe de même origine et conserve les protections habituelles.
- Menu mobile, cartes, création, équipements, upload, cover, fiche, édition et
  archivage manipulés dans cette vue. Pas de débordement horizontal observé :
  largeur utile et largeur de contenu toutes deux à 375 px, hors barre de défilement.
- Il s’agit d’un contrôle à largeur mobile, pas d’un essai sur téléphone physique
  ni d’une validation spécifique Safari/iOS.
- Aucune erreur console de l’application durant les parcours v8. Des erreurs
  d’une extension du navigateur de contrôle ont été distinguées des erreurs du site.
- Lectures et mutations observées en 2xx ; redirection 307 attendue pour la fiche
  privée après déconnexion. Aucune nouvelle réponse 500 observée sur ce parcours.
- Des requêtes annulées pendant la navigation n’ont pas de statut 500. Un 404 de
  favicon propre à la page de contrôle a été corrigé en réutilisant favicon.svg.
- Quelques commandes du navigateur de contrôle ont rencontré un délai protocole
  alors que le DOM montrait déjà la page attendue. Leur état a été inspecté puis
  les étapes reprises ; ces délais ne sont pas comptés comme des validations.

## Fichiers principaux et portée

- `vite.config.ts`, `scripts/build-verified.sh`, `tests/bundle-navigation.mjs` :
  correction et garde de compilation du routeur.
- `app/layout.tsx`, `components/hostflow/client.ts`, `app.tsx`, `navigation.tsx` :
  état partagé, rendu du chargement, navigation et organisation active.
- `components/hostflow/properties/client.ts` et les composants `form.tsx`,
  `list.tsx`, `detail.tsx`, `photos.tsx`, `shared.tsx` du même dossier :
  formulaires, données asynchrones et navigation.
- `lib/hostflow/errors.ts`, `server.ts` : diagnostics serveur ciblés.
- `tests/{workspace-provider,workspace-refresh,property-resource,error-diagnostics}.test.mjs`
  et `tests/browser-properties-flow.mjs` : régressions.

Le correctif est livré, mais l’erreur serveur historique reste un incident ouvert.
Une mise à jour de Vinext devra repasser le contrat du bundle et le parcours réel
de navigation. Aucune phase suivante n’est commencée.

## Données de contrôle

Trois logements nommés « QA v0.3.1 — … » ont été créés dans l’organisation
existante avec des adresses de contrôle. Les deux premiers possèdent chacun
deux images de contrôle ; le troisième vérifie le scénario de création sans photo.
Ils sont archivés et récupérables ; ils ne gonflent plus le portefeuille actif.
Les logements existants de l’utilisateur n’ont pas été modifiés.
Aucune migration, table, policy, clé ou permission n’est modifiée par ce correctif.
