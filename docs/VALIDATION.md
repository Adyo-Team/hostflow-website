# Validation — HostFlow Foundation v0.2

Date : 14 septembre 2026. **Supabase raccordé ; tests réussis avec trois vraies sessions Auth.**

## Résultats

- **49 tests locaux réussis** : 20 de non-régression SQL v0.1, 25 pour le socle v0.2, 2 CSRF et 2 de validation des liens d’invitation. PostgreSQL embarqué PGlite avec pgcrypto ; les identités de ces seuls tests locaux sont des fixtures.
- `tests/remote-rls.sql` exécuté avec succès dans PostgreSQL Supabase, puis entièrement annulé : isolation croisée, rôles, profils privés, invitations, dernier owner, suspension/retrait, audit, progression et refus anonyme.
- `tests/connected-http.mjs` réussi : BFF connecté sans cache, redirection des routes privées anonymes, formulaires accessibles, identifiants invalides et mutations/REST/RPC anonymes refusés.
- **`tests/live-foundation.mjs` exécuté jusqu’au bout avec succès**, via `tests/run-live-local.mjs`, contre Next.js natif relié au vrai projet. Aucun mock, aucune clé privilégiée dans HostFlow. Les assertions portent sur les réponses HTTP, les cookies de session et les requêtes REST/RPC avec un vrai JWT Supabase.
- TypeScript strict et build Next.js natif réussis. ESLint : aucune erreur ; 8 avertissements sur les navigations complètes conservées après changement de session pour vider l’état courant. Build Sites/Vinext vérifié avant publication.

## Matrice des sessions réelles

| Parcours                                                | Résultat                                                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A, B et collaborateur : comptes Auth et profils         | Trois comptes créés et confirmés administrativement pour le test autorisé ; trois connexions réussies                                                         |
| Compte personnel avant toute adhésion                   | Profil présent, aucune organisation ni adhésion créée ; `/welcome` et `/settings` accessibles                                                                 |
| A crée Alpha                                            | Organisation créée, A automatiquement owner                                                                                                                   |
| A invite le collaborateur                               | Lien généré, accepté par le destinataire ; rôle staff, une seule adhésion, aucune organisation créée par le collaborateur                                     |
| Permissions                                             | Staff ne peut pas inviter ; manager consulte l’équipe mais ne modifie pas l’organisation ; admin ne modifie pas l’owner ; owner peut changer les rôles permis |
| Dernier owner                                           | Rétrogradation refusée                                                                                                                                        |
| B crée Beta                                             | Organisation indépendante créée                                                                                                                               |
| **B tente de lire Alpha avec son JWT réel**             | **Zéro ligne pour les tables tenant, audit, invitations et profil de A ; RPC d’équipe sans données/refus**                                                    |
| Cookie d’organisation falsifié                          | Ne donne aucun accès à Alpha ; sélection restaurée sur une adhésion autorisée                                                                                 |
| Suspension puis retrait                                 | Perte immédiate des adhésions ; compte et profil conservés ; accueil personnel accessible                                                                     |
| Déconnexion puis reconnexion                            | Session supprimée puis recréée, organisation Alpha restaurée                                                                                                  |
| Nouvelle requête directe `/team` avec cookies restaurés | HTTP 200 et organisation correcte ; sans session, redirection vers `/login`                                                                                   |

Ces résultats ne sont pas des tests de livraison d’email ni un parcours de connexion piloté dans le navigateur.

## Navigateur, responsive et réseau

- Le dashboard, l’équipe, la navigation mobile, les états vides et l’onboarding avaient été vérifiés visuellement avant raccordement ; aucun faux contenu n’a été ajouté pour les tests connectés.
- Inscription actuelle revue sur desktop et à 390 px : compte personnel explicite, aucune étape obligatoire de création d’organisation.
- Nouveau composant `WelcomeAccount` vérifié à 390 et 1440 px dans un aperçu local isolé, clairement étiqueté comme aperçu de composant, sans session ni données privées. Aucun débordement horizontal ; lien invalide refusé avec message compréhensible. Cet aperçu temporaire est supprimé avant publication.
- Aucun avertissement ni erreur de l’application dans la console lors du contrôle final. Les erreurs signalées par l’extension Chrome ont été identifiées séparément.
- Les réponses réseau de la suite HTTP réelle sont vérifiées ; les 401/403 attendus sont des refus de sécurité, pas des échecs applicatifs. La QA navigateur complète avec une session authentifiée reste distincte et non exécutée.

## Backend livré

Projet `hostflow` : `zwcrmcuptrccglkijfls`, région `eu-west-1`.

- Tables : `profiles`, `organizations`, `organization_members`, `organization_invitations`, `audit_logs`. L’ancien nom `organization_memberships` reste une vue de compatibilité SECURITY INVOKER. Registre `private.platform_admins` fermé aux clients.
- Policies : `profiles_read_self`, `profiles_update_self`, `org_read`, `members_read`, `invitations_read`, `audit_read`. Écritures métier uniquement par RPC contrôlées, écritures directes refusées. RLS sur toutes les tables exposées ; aucun droit EXECUTE public sur les implémentations privées privilégiées.
- Migrations appliquées : `20260914003227`, `20260914003249`, `20260914003309`. Aucune migration supplémentaire ou destructive pour la correction des comptes personnels.
- Routes : dashboard `/`, Auth `/login`, `/signup`, `/auth/confirm`, récupération, `/invite`, `/onboarding`, `/team`, `/settings`, `/roles`, `/api/hostflow`. **Nouvelle route privée `/welcome`**, utilisée pour les comptes sans adhésion ; redirections de confirmation et de l’application adaptées. Le proxy et l’API valident la session indépendamment de la sélection de tenant.
- Auth, profils, organisations owner, sélecteur d’organisation, équipe, invitations à copier, changement de rôle, suspension/retrait, progression persistante, dashboard et états vides fonctionnels. Les refus SQL d’autorisation sont maintenant renvoyés en HTTP 403.
- Dernier contrôle des advisors : aucune erreur RLS. Diagnostic INFO pour `private.platform_admins`, volontairement sans policy/droit client ([explication](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)). Une alerte Auth signale que la protection contre les mots de passe compromis est désactivée ; réglage à activer dans Supabase selon les possibilités du projet ([documentation](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)). Le connecteur disponible ne permet pas de modifier ce réglage. Index non utilisés sur la base neuve conservés.

## Provisionnement et nettoyage du test autorisé

Après l’autorisation explicite de l’utilisateur, une fonction temporaire a créé exactement les trois comptes convenus. Elle était limitée à trois adresses, à une durée courte et à un nonce secret supplémentaire ; un appel sans nonce a été refusé en HTTP 401. Aucun email n’a été envoyé et la confirmation email globale n’a pas été désactivée.

Immédiatement après les créations, la fonction a été remplacée par une réponse HTTP 410, sans client administratif ni capacité de création. Le même ancien accès a été retesté : HTTP 410. Le fichier versionné `supabase/functions/foundation-qa/index.js` contient uniquement ce gestionnaire fermé. Aucune clé service_role n’est présente dans l’application ou le dépôt.

Les deux organisations QA, leurs membres, invitations, activités, les trois comptes Auth et leurs profils ont été supprimés avec ciblage par UUID et marqueur de lot. Contrôle final : zéro compte QA, zéro organisation QA ; les **deux comptes réels et l’organisation réelle préexistants sont conservés**. Les identifiants temporaires locaux sont supprimés.

## Limites restant à vérifier

- Inscription avec une adresse contrôlée, réception/ouverture de confirmation et récupération réelle du mot de passe. Les comptes administrativement confirmés de cette suite ne valident pas ces emails.
- Réglages Site URL / callbacks / SMTP dans Supabase : non modifiables avec le connecteur disponible ; confirmation email maintenue active.
- Protection Auth contre les mots de passe compromis : désactivée selon le dernier advisor, à configurer dans Supabase.
- Expiration temporelle complète d’une session, concurrence multiprocessus du dernier owner et parcours navigateur connecté desktop/mobile. La restauration HTTP des cookies et les protections SQL ont bien été testées.
- Les invitations sont des liens à copier, sans envoi automatique. Les portails Guest / Property Owner restent hors périmètre.

Aucun module Properties, Reservations, Calendar, Cleaning, Maintenance, Finance, Automation ou OTA n’a été développé.
