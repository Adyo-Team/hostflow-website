import { safeOrigin } from "@/lib/hostflow/request-security";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  backendConfig,
  serverSupabase,
  setActiveOrganization,
} from "@/lib/supabase/server";
import { mutationSchema } from "@/lib/hostflow/validation";
import { AppError, checkDb, loadWorkspace } from "@/lib/hostflow/server";
import { emptyWorkspace } from "@/lib/hostflow/types";
export const dynamic = "force-dynamic";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers });
function failure(error: unknown) {
  return reply(
    {
      error:
        error instanceof AppError
          ? error.message
          : "Le service est momentanément indisponible.",
    },
    error instanceof AppError ? error.status : 503,
  );
}
export async function GET() {
  try {
    if (!backendConfig()) return reply(emptyWorkspace);
    const db = await serverSupabase();
    const { data, error } = await db.auth.getUser();
    if (
      error &&
      error.name !== "AuthSessionMissingError" &&
      (error.status ?? 500) >= 500
    )
      throw new AppError(
        "Impossible de vérifier votre session. Réessayez.",
        503,
      );
    if (!data.user) return reply({ ...emptyWorkspace, configured: true });
    return reply(await loadWorkspace(db, data.user));
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (
      !safeOrigin(
        request.headers.get("origin"),
        request.url,
        backendConfig()?.appUrl,
      )
    )
      throw new AppError("Requête non autorisée.", 403);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      throw new AppError("Format de requête invalide.", 415);
    const reader = request.body?.getReader();
    let raw = "";
    let bytes = 0;
    const decoder = new TextDecoder();
    if (reader) {
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          bytes += part.value.length;
          if (bytes > 12000) {
            await reader.cancel();
            throw new AppError("Requête trop volumineuse.", 413);
          }
          raw += decoder.decode(part.value, { stream: true });
        }
        raw += decoder.decode();
      } finally {
        reader.releaseLock();
      }
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new AppError("Requête invalide.");
    }
    const parsed = mutationSchema.safeParse(json);
    if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
    const input = parsed.data,
      config = backendConfig();
    if (!config)
      throw new AppError(
        "Votre espace est en cours de configuration. L’authentification n’est pas encore disponible.",
        503,
      );
    const db = await serverSupabase();
    if (input.action === "login") {
      const { error } = await db.auth.signInWithPassword({
        email: input.email,
        password: input.password,
      });
      if (error)
        throw new AppError(
          "Connexion impossible. Vérifiez vos identifiants et la confirmation de votre email.",
          401,
        );
      return reply({ ok: true });
    }
    if (input.action === "signup") {
      const { data, error } = await db.auth.signUp({
        email: input.email,
        password: input.password,
        options: {
          emailRedirectTo: config.appUrl + "/auth/confirm",
          data: { first_name: input.firstName, last_name: input.lastName },
        },
      });
      if (error)
        throw new AppError(
          "Inscription impossible pour le moment. Réessayez ou utilisez la récupération de compte.",
        );
      return reply({
        ok: true,
        signedIn: !!data.session,
        message:
          "Si l’inscription est possible, un email de confirmation vous a été envoyé.",
      });
    }
    if (input.action === "forgotPassword") {
      const { error } = await db.auth.resetPasswordForEmail(input.email, {
        redirectTo: config.appUrl + "/auth/confirm?flow=recovery",
      });
      if (error && error.status && error.status >= 500)
        throw new AppError(
          "Le service de récupération est temporairement indisponible.",
          503,
        );
      return reply({
        ok: true,
        message:
          "Si un compte correspond à cette adresse, vous recevrez un lien de récupération.",
      });
    }
    if (input.action === "logout") {
      const { error } = await db.auth.signOut({ scope: "local" });
      if (error) throw new AppError("Déconnexion impossible. Réessayez.", 503);
      (await cookies()).delete("hf-organization");
      return reply({ ok: true });
    }
    const {
      data: { user },
      error: authError,
    } = await db.auth.getUser();
    if (authError || !user)
      throw new AppError("Connectez-vous pour continuer.", 401);
    if (input.action === "resetPassword") {
      const { error } = await db.auth.updateUser({ password: input.password });
      if (error)
        throw new AppError(
          "Le mot de passe n’a pas pu être modifié. Demandez un nouveau lien.",
        );
      await db.auth.signOut();
      return reply({ ok: true });
    }
    if (input.action === "switchOrganization") {
      const result = await db
        .from("organization_members")
        .select("id")
        .eq("organization_id", input.organizationId)
        .eq("user_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      checkDb(result.error);
      if (!result.data) throw new AppError("Organisation inaccessible.", 403);
      await setActiveOrganization(input.organizationId);
      return reply({ ok: true });
    }
    let result;
    switch (input.action) {
      case "createOrganization":
        result = await db.rpc("create_organization", {
          p_name: input.name,
          p_slug: input.slug,
          p_timezone: input.timezone,
          p_currency: input.currency,
          p_country: input.country,
        });
        break;
      case "updateOrganization":
        result = await db.rpc("update_organization", {
          p_organization_id: input.organizationId,
          p_name: input.name,
          p_timezone: input.timezone,
          p_currency: input.currency,
          p_country: input.country,
        });
        break;
      case "updateProfile":
        result = await db
          .from("profiles")
          .update({
            first_name: input.firstName,
            last_name: input.lastName,
            phone: input.phone || null,
          })
          .eq("id", user.id)
          .select("id")
          .single();
        break;
      case "updateMembership":
        result = await db.rpc("update_membership", {
          p_organization_id: input.organizationId,
          p_membership_id: input.membershipId,
          p_role: input.role,
          p_status: input.status,
        });
        break;
      case "removeMember":
        result = await db.rpc("remove_member", {
          p_organization_id: input.organizationId,
          p_membership_id: input.membershipId,
        });
        break;
      case "completeTeamSetup":
        result = await db.rpc("complete_team_setup", {
          p_organization_id: input.organizationId,
        });
        break;
      case "createInvitation":
        result = await db.rpc("create_invitation", {
          p_organization_id: input.organizationId,
          p_email: input.email,
          p_role: input.role,
        });
        break;
      case "revokeInvitation":
        result = await db.rpc("revoke_invitation", {
          p_organization_id: input.organizationId,
          p_invitation_id: input.invitationId,
        });
        break;
      case "acceptInvitation":
        result = await db.rpc("accept_invitation", {
          p_token: input.token,
        });
        break;
    }
    checkDb(result.error);
    if (
      input.action === "createOrganization" ||
      input.action === "acceptInvitation"
    ) {
      if (typeof result.data !== "string")
        throw new AppError("Réponse inattendue du service.", 503);
      await setActiveOrganization(result.data);
    }
    if (input.action === "createInvitation")
      return reply({
        ok: true,
        invitationUrl:
          config.appUrl +
          "/invite?token=" +
          encodeURIComponent(String(result.data)),
      });
    return reply({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
