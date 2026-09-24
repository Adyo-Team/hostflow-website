import type { Task } from "@/lib/tasks/types";
import type { Property, Amenity, PropertyImage } from "@/lib/properties/types";
import type { Reservation, PropertyBlock } from "@/lib/reservations/types";
import type {
  Profile,
  Organization,
  Membership,
  Invitation,
  AuditEvent,
  StoredRole,
  MemberStatus,
} from "@/lib/hostflow/types";
type Table<Row> = {
  Row: { [K in keyof Row]: Row[K] };
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
type Rpc<Args, Returns> = { Args: Args; Returns: Returns };
type OrgId = { p_organization_id: string };
// Matches the versioned foundation migrations; no privileged key/client required.
export type Database = {
  public: {
    Tables: {
      tasks: Table<Task>;
      reservations: Table<Reservation>;
      property_blocks: Table<PropertyBlock>;
      properties: Table<Property & { search_text: string }>;
      amenities: Table<Amenity>;
      property_amenities: Table<{
        organization_id: string;
        property_id: string;
        amenity_id: string;
      }>;
      property_images: Table<PropertyImage>;
      profiles: Table<Profile>;
      organizations: Table<Organization>;
      organization_members: Table<
        Omit<Membership, "organization" | "email"> & {
          created_by: string;
          updated_at: string;
        }
      >;
      organization_invitations: Table<
        Invitation & {
          token_hash: string;
          created_by: string;
          updated_at: string;
        }
      >;
      audit_logs: Table<
        AuditEvent & { organization_id: string; actor_id: string | null }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      task_property_names: Rpc<OrgId, { id: string; name: string }[]>;
      save_property: Rpc<
        OrgId & {
          p_id: string;
          p_data: Record<string, unknown>;
          p_amenities: string[];
          p_expected_version: number | null;
        },
        string
      >;
      set_property_archived: Rpc<
        OrgId & {
          p_id: string;
          p_archived: boolean;
          p_expected_version: number;
        },
        undefined
      >;
      reserve_property_image: Rpc<
        OrgId & {
          p_property_id: string;
          p_id: string;
          p_content_type: string;
          p_size_bytes: number;
        },
        string
      >;
      finish_property_image: Rpc<
        OrgId & { p_property_id: string; p_image_id: string },
        undefined
      >;
      arrange_property_images: Rpc<
        OrgId & { p_property_id: string; p_order: string[]; p_cover: string },
        undefined
      >;
      prepare_property_image_delete: Rpc<
        OrgId & { p_property_id: string; p_image_id: string },
        string
      >;
      property_filter_cities: Rpc<OrgId, string[]>;
      create_organization: Rpc<
        {
          p_name: string;
          p_slug: string;
          p_timezone: string;
          p_currency: string;
          p_country: string;
        },
        string
      >;
      update_organization: Rpc<
        OrgId & {
          p_name: string;
          p_timezone: string;
          p_currency: string;
          p_country: string;
        },
        undefined
      >;
      update_membership: Rpc<
        OrgId & {
          p_membership_id: string;
          p_role: StoredRole;
          p_status: MemberStatus;
        },
        undefined
      >;
      remove_member: Rpc<OrgId & { p_membership_id: string }, undefined>;
      create_invitation: Rpc<
        OrgId & { p_email: string; p_role: StoredRole },
        string
      >;
      revoke_invitation: Rpc<OrgId & { p_invitation_id: string }, undefined>;
      accept_invitation: Rpc<{ p_token: string }, string>;
      list_team: Rpc<OrgId, Omit<Membership, "organization">[]>;
      complete_team_setup: Rpc<OrgId, undefined>;
    };
    Enums: { organization_role: StoredRole; membership_status: MemberStatus };
    CompositeTypes: Record<string, never>;
  };
};
