# HostFlow v0.3 — Properties

## Périmètre livré

Portefeuille réel Supabase : liste paginée (12 par défaut), recherche nom/nom interne/ville, filtres statut/ville/type, quatre tris ; création et édition en six étapes ; fiche logement ; équipements structurés ; galerie privée ; archivage et restauration. Les autres onglets de la fiche annoncent explicitement une prochaine version.

Routes : `/properties`, `/properties/new`, `/properties/[id]`, `/properties/[id]/edit`. Les pages privées réutilisent le shell et la session existants. L’API `/api/properties/[[...path]]` contrôle l’origine des écritures, la session, l’appartenance active et le rôle. La RLS s’applique également aux requêtes Supabase directes.

## Migration et tables

Migration additive appliquée : `20260914092103_properties_v03.sql`. La migration complémentaire `20260914101639_properties_conflict_responses.sql` classe les conflits métier en PT409 pour éviter les tentatives infinies de PostgREST 14 avec SQLSTATE 40001. Les trois migrations du socle restent immuables. Aucun effacement de données existantes.

| Table              | Fonction                                                                          |
| ------------------ | --------------------------------------------------------------------------------- |
| properties         | Tous les champs du logement, tenant, auteur, timestamps et version de concurrence |
| amenities          | Catalogue structuré et extensible de 14 équipements                               |
| property_amenities | Relation tenant/logement/équipement, clé composite et intégrité référentielle     |
| property_images    | Métadonnées, chemin Storage immuable, ordre, couverture et état de transfert      |

`organization_id` est obligatoire sur chaque table métier. Les clés étrangères composites des équipements et images interdisent les relations entre tenants. Contraintes : capacité 1–1000, chambres/lits ≥ 0, salles de bain au dixième, frais positifs, commission 0–100, coordonnées cohérentes et bornées, formats texte/heure/statut contrôlés. Index tenant/statut, ville, type, nom ; index owner réservé, auteur, équipement et ordre des photos ; unicité de la couverture.

`owner_id` est réservé et contraint à NULL : aucun faux propriétaire ni module Owners. Lors du futur module, ajouter la table Owners puis remplacer cette contrainte par une FK `(organization_id, owner_id)` compatible, avant d’autoriser une attribution. Le propriétaire de logement est une entité différente de l’owner de l’organisation.

## Permissions

| Action                                    | owner/admin | manager | staff |
| ----------------------------------------- | ----------- | ------- | ----- |
| Liste, fiche, données privées, photos     | Oui         | Oui     | Non   |
| Création, édition, équipements et galerie | Oui         | Oui     | Non   |
| Archivage / restauration                  | Oui         | Non     | Non   |
| Suppression physique du logement          | Non         | Non     | Non   |

Le staff attend les futures affectations opérationnelles ; aucun accès global aux codes, Wi-Fi ou notes. property_owner/guest n’ont pas d’accès au portefeuille dans cette version. Aucun rôle de plateforme ne contourne les tenants.

Policies nouvelles : `properties_read/insert/update`, `amenities_read`, `property_amenities_read/insert/delete`, `property_images_read/insert/update/delete`, puis `property_photos_read/insert/delete` sur Storage. Les lectures de métadonnées et de fichiers relisent les memberships. Il n’existe pas de policy permettant la suppression physique d’un logement ni l’UPDATE/upsert d’un objet Storage.

Les RPC du module sont SECURITY INVOKER, search_path fixé, EXECUTE retiré à PUBLIC/anon. Les guards interdisent le déplacement de tenant et de créateur, contrôlent l’archivage et incrémentent la version. `save_property` enregistre les champs et le jeu d’équipements dans une transaction ; une version périmée renvoie 409. Une reprise de création avec le même UUID ne crée pas de doublon et n’écrase pas les données.

## Photos privées

Bucket `property-photos`, `public=false`, JPEG/PNG/WebP, 5 MiB par image, 30 images par logement. Contrôles MIME et signature binaire côté API, limites supplémentaires côté bucket/base. Pas de HEIC/SVG ni traitement ou compression automatique. Plusieurs fichiers sont envoyés séquentiellement, avec progression et erreurs individuelles. Glisser-déposer, boutons d’ordre, couverture et confirmation de suppression.

Chemin : `organization/property/image_uuid.extension`. Réservation des métadonnées → envoi Storage → validation de présence réelle → état ready. Une interruption conserve un état pending récupérable par suppression ; elle ne présente pas le fichier comme envoyé. Suppression : état deleting → suppression via Storage API → retrait des métadonnées. Le guard refuse le retrait des métadonnées tant que l’objet existe. Les fichiers ne sont jamais effacés par SQL.

L’application sert les images via l’API authentifiée avec `Cache-Control: private, no-store`, nosniff et CSP restrictive. Aucun bucket public ni URL signée persistante ; chaque téléchargement réévalue la session et les permissions. L’archivage conserve les fichiers, interdit les modifications et permet la consultation aux responsables autorisés.

## Expérience et conservation

Les saisies restent en mémoire lors d’un retour d’étape ou d’une erreur. Les champs sensibles ne sont pas enregistrés dans localStorage. Protection contre le départ de page et le changement d’organisation avec données non enregistrées ; navigation d’étapes et fin du formulaire bloquées pendant un transfert. L’enregistrement champs/équipements précède les photos : recharger la route d’édition restitue la version enregistrée. Une sortie volontaire peut abandonner des saisies non enregistrées après avertissement.

Le dashboard compte les logements actifs en base et journalise l’activité des logements/images sans recopier leur contenu sensible dans l’audit. Les revenus, réservations et missions restent indisponibles. Aucun logement fictif dans les routes produit.

## Validation

Voir `VALIDATION-v0.3.md` pour les résultats, leur environnement et leurs limites. Suite SQL : `pnpm test`. Acceptation distante : `HOSTFLOW_TEST_SUITE=properties HOSTFLOW_TEST_ACCOUNTS_FILE=<fichier privé> node --env-file=.env.local tests/run-live-local.mjs`, après compilation Next native. Le fichier privé contient trois comptes confirmés A/B/MEMBER et leurs IDs ; aucune clé privilégiée. Les tests ne basculent jamais vers des mocks.

Test de l’hébergement : `HOSTFLOW_TEST_ORIGIN=<origine hébergée> HOSTFLOW_TEST_ACCOUNTS_FILE=<fichier privé> node tests/live-properties-worker.mjs`. Il vérifie l’API du build Worker avec une vraie session, les uploads multipart, les octets privés, la couverture, la suppression et les routes directes. Les comptes doivent appartenir à une organisation QA avec un logement actif sans photos. Le fichier privé contient également la liste `organizations`, Alpha en premier.
