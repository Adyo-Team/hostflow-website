export const roles = ["owner", "admin", "manager", "staff"] as const;
export type Role = (typeof roles)[number];
// Reserved roles remain readable for compatible upgrades, but cannot be assigned yet.
export type FutureRole = "property_owner" | "guest";
export type StoredRole = Role | FutureRole;
export type MemberStatus = "active" | "suspended";
export type Page =
  | "dashboard"
  | "team"
  | "settings"
  | "roles"
  | "properties"
  | "reservations"
  | "calendar"
  | "tasks";
export const roleLabels: Record<StoredRole, string> = {
  owner: "Propriétaire de l’organisation",
  admin: "Administrateur",
  manager: "Manager",
  staff: "Équipe / Prestataire",
  property_owner: "Propriétaire de logement (à venir)",
  guest: "Voyageur (à venir)",
};
export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
}
export interface Organization {
  id: string;
  name: string;
  slug: string;
  country: string | null;
  timezone: string;
  currency: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  team_setup_completed_at: string | null;
}
export interface Membership {
  id: string;
  organization_id: string;
  user_id: string;
  display_name: string;
  role: StoredRole;
  status: MemberStatus;
  created_at: string;
  email?: string;
  organization?: Organization;
}
export interface Invitation {
  id: string;
  organization_id: string;
  email: string;
  role: StoredRole;
  expires_at: string;
  status: "pending" | "accepted" | "revoked";
  invited_by: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}
export interface AuditEvent {
  id: number;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}
export interface WorkspaceState {
  configured: boolean;
  user: { id: string; email: string } | null;
  profile: Profile | null;
  memberships: Membership[];
  activeOrganizationId: string | null;
  members: Membership[];
  invitations: Invitation[];
  audit: AuditEvent[];
  activePropertyCount: number | null;
}
export const emptyWorkspace: WorkspaceState = {
  configured: false,
  user: null,
  profile: null,
  memberships: [],
  activeOrganizationId: null,
  members: [],
  invitations: [],
  audit: [],
  activePropertyCount: null,
};
export const canManageTeam = (role?: StoredRole) =>
  role === "owner" || role === "admin";
export const canReadTeam = (role?: StoredRole) =>
  canManageTeam(role) || role === "manager";
export const canManageMember = (
  actor: Membership | undefined,
  target: Membership,
) =>
  !!actor &&
  (actor.role === "owner" ||
    (actor.role === "admin" && ["manager", "staff"].includes(target.role)));
export const assignableRoles = (actor?: StoredRole): Role[] =>
  actor === "owner"
    ? [...roles]
    : actor === "admin"
      ? ["manager", "staff"]
      : [];
export const invitationRoles = (actor?: StoredRole): Role[] =>
  assignableRoles(actor).filter((r) => r !== "owner");
export const profileName = (profile: Profile | null) =>
  profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ")
    : "";
