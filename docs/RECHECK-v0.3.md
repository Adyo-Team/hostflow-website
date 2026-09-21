# Contre-vérification HostFlow v0.3 — 14 septembre 2026

Audit du code effectivement publié, des cinq migrations distantes, des 14 policies Properties/Storage et du bucket privé. Aucun changement de schéma, de rôle, de RLS ou de méthode de connexion.

## Résultats

- 70 tests existants repassés, puis trois régressions supplémentaires validées : maintien du délai maximal avec un signal d’annulation, annulation lors d’un changement d’organisation, conservation de l’espace après un échec d’actualisation et effacement après déconnexion confirmée.
- TypeScript strict, compilation Sites/Vinext et lint vérifiés. Zéro erreur ; avertissements de navigation préexistants.
- Les **23 contrôles d’acceptation complets ont été exécutés sur le site publié**, avec trois nouveaux comptes Auth isolés et deux organisations de test. Création, lecture, modification, équipements, recherche, filtres, pagination, trois vrais uploads, ordre, cover, téléchargement des octets, suppression, archivage/restauration, reconnexion et route privée directe réussis.
- Isolation également vérifiée directement via le client Supabase : Beta ne peut lire les lignes Alpha ni lister, télécharger, envoyer ou supprimer ses photos. Les droits du staff sont révoqués immédiatement avec une session déjà ouverte ; le manager ne peut archiver.
- Le smoke test de publication vérifie désormais aussi le chargement du profil et de l’organisation via `/api/hostflow`, qui manquait au précédent smoke test. Il est relancé après publication du correctif ; le résultat est communiqué dans le rapport de livraison.

## Défauts trouvés et corrections

1. Un échec d’actualisation automatique de l’espace vidait le contexte puis démontait le formulaire, avec perte possible des saisies. Le dernier contexte validé est désormais conservé pendant une erreur de réseau ; le bandeau d’erreur et son bouton Réessayer restent visibles, ainsi que le formulaire. Une réponse confirmant l’absence de session efface toujours le contexte. Chaque opération reste soumise à Auth et RLS côté serveur.
2. Le signal d’annulation du composant remplaçait le délai maximal des lectures Properties. Les deux signaux sont désormais combinés, pour conserver le délai de 60 secondes et l’annulation lors du démontage/changement d’organisation.
3. Les erreurs de base non reconnues journalisent seulement leur code technique, sans identité, contenu SQL, données de formulaire ni secrets.

## Limites à conserver dans le compte rendu

- La première tentative a rencontré une réponse 500 sur `/api/hostflow` après une connexion valide. Une vérification directe du profil/des adhésions/des organisations a réussi, puis l’ensemble des 23 tests a réussi à la seconde tentative. La cause exacte de cette réponse transitoire n’est pas établie : ne pas la présenter comme corrigée. La nouvelle journalisation permettra de qualifier une récidive.
- Les requêtes HTTP depuis l’environnement de test ont parfois duré 10 à 15 secondes ; les événements Worker consultés indiquaient des traitements plus courts. Ne pas attribuer automatiquement tout ce délai au serveur HostFlow.
- Le navigateur de contrôle charge bien la page de connexion sans erreur de console de l’application. Le parcours complet dans un navigateur connecté exige encore une connexion sécurisée de l’utilisateur. Les anciens contrôles visuels desktop/mobile étaient isolés et ne remplacent pas ce parcours réel.
- L’avertissement Supabase concernant la protection contre les mots de passe compromis est préexistant et inchangé.

Le provisionneur temporaire des comptes de test a été refermé immédiatement après création (HTTP 410). Les données de test sont destinées à être supprimées après le smoke test final ; les trois utilisateurs et les deux organisations préexistants doivent être conservés.
