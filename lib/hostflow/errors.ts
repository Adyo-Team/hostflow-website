export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function checkDb(
  error: { message: string; code?: string } | null,
  operation = "database",
) {
  if (!error) return;
  const known: Record<string, string> = {
    last_owner_required:
      "Conservez au moins un propriétaire actif. Nommez un autre owner avant de retirer cet accès.",
    owner_required:
      "Cette action est réservée au propriétaire de l’organisation.",
    profile_required: "Complétez votre prénom et votre nom dans votre profil.",
    unsupported_role: "Ce rôle n’est pas disponible pour cette action.",
    invalid_country: "Sélectionnez un pays valide.",
    member_not_found:
      "Ce membre n’est plus disponible dans cette organisation.",
    already_member: "Ce compte appartient déjà à cette organisation.",
    invitation_unavailable:
      "Cette invitation est invalide, expirée ou destinée à un autre compte.",
    verified_user_required: "Confirmez votre adresse email pour continuer.",
    invalid_timezone: "Fuseau horaire invalide.",
  };
  for (const [key, value] of Object.entries(known))
    if (error.message.includes(key))
      throw new AppError(
        value,
        error.code === "42501" ? 403 : error.code === "23505" ? 409 : 400,
      );
  if (error.code === "42501")
    throw new AppError("Vous n’avez pas les droits nécessaires.", 403);
  if (error.code === "23505")
    throw new AppError(
      "Cet identifiant est déjà utilisé. Choisissez-en un autre.",
      409,
    );
  if (
    error.code === "PGRST205" ||
    error.code === "42P01" ||
    error.code === "PGRST202"
  )
    throw new AppError(
      "La base de données doit être initialisée avant de continuer.",
      503,
    );
  // Log only the database error code: never query values, identities or secrets.
  console.error("HostFlow database request failed", {
    operation,
    code:
      error.code && /^[A-Z0-9]{5,10}$/.test(error.code)
        ? error.code
        : "unknown",
  });
  throw new AppError(
    "L’opération n’a pas pu aboutir. Réessayez dans un instant.",
    500,
  );
}
