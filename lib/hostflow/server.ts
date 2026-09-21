import { canEditProperties } from "@/lib/properties/types";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Membership, WorkspaceState } from "./types";
import { emptyWorkspace, canManageTeam, profileName } from "./types";
import { checkDb } from "./errors";
export { AppError, checkDb } from "./errors";
export async function loadWorkspace(
  db: SupabaseClient<Database>,
  user: User,
): Promise<WorkspaceState> {
  const [memberResult, profileResult, organizationResult] = await Promise.all([
    db
      .from("organization_members")
      .select("id,organization_id,user_id,display_name,role,status,created_at")
      .eq("user_id", user.id)
      .eq("status", "active")
      .order("created_at"),
    db
      .from("profiles")
      .select("id,first_name,last_name,avatar_url,phone,created_at,updated_at")
      .eq("id", user.id)
      .single(),
    db
      .from("organizations")
      .select(
        "id,name,slug,country,timezone,currency,created_by,created_at,updated_at,team_setup_completed_at",
      ),
  ]);
  checkDb(memberResult.error, "workspace.memberships");
  checkDb(profileResult.error, "workspace.profile");
  checkDb(organizationResult.error, "workspace.organizations");
  const organizations = new Map(
    (organizationResult.data ?? []).map((o) => [o.id, o]),
  );
  const memberships: Membership[] = (memberResult.data ?? []).flatMap((m) => {
    const organization = organizations.get(m.organization_id);
    return organization
      ? [
          {
            ...m,
            display_name: profileName(profileResult.data) || m.display_name,
            organization,
          },
        ]
      : [];
  });
  const preferred = (await cookies()).get("hf-organization")?.value;
  const active =
    memberships.find((m) => m.organization_id === preferred) ?? memberships[0];
  const state: WorkspaceState = {
    ...emptyWorkspace,
    configured: true,
    user: { id: user.id, email: user.email ?? "" },
    profile: profileResult.data,
    memberships,
    activeOrganizationId: active?.organization_id ?? null,
  };
  if (!active) return state;
  if (canEditProperties(active.role)) {
    const count = await db
      .from("properties")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", active.organization_id)
      .eq("status", "active");
    checkDb(count.error, "workspace.property_count");
    state.activePropertyCount = count.count ?? 0;
  }
  const members = await db.rpc("list_team", {
    p_organization_id: active.organization_id,
  });
  checkDb(members.error, "workspace.team");
  state.members = members.data ?? [];
  if (canManageTeam(active.role)) {
    const [invitations, audit] = await Promise.all([
      db
        .from("organization_invitations")
        .select(
          "id,organization_id,email,role,status,invited_by,expires_at,accepted_at,revoked_at,created_at",
        )
        .eq("organization_id", active.organization_id)
        .eq("status", "pending")
        .order("created_at", { ascending: false }),
      db
        .from("audit_logs")
        .select("id,action,entity_type,entity_id,metadata,created_at")
        .eq("organization_id", active.organization_id)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    checkDb(invitations.error, "workspace.invitations");
    checkDb(audit.error, "workspace.activity");
    state.invitations = invitations.data ?? [];
    state.audit = audit.data ?? [];
  }
  return state;
}
