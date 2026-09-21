import type { StoredRole } from "@/lib/hostflow/types";
import { canEditProperties } from "@/lib/properties/types";
export const canManageReservations = (role?: StoredRole) =>
  !!role && canEditProperties(role);
export const reservationStatuses = {
  confirmed: "Confirmée",
  cancelled: "Annulée",
} as const;
export const blockReasons = {
  owner: "Usage propriétaire",
  works: "Travaux",
  maintenance: "Maintenance",
  internal: "Indisponibilité interne",
} as const;
export interface Reservation {
  id: string;
  organization_id: string;
  property_id: string;
  check_in: string;
  check_out: string;
  status: keyof typeof reservationStatuses;
  source: "manual" | "airbnb" | "booking" | "vrbo" | "direct" | "other";
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guests_count: number;
  internal_notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}
export interface PropertyBlock {
  id: string;
  organization_id: string;
  property_id: string;
  start_date: string;
  end_date: string;
  reason: keyof typeof blockReasons;
  notes: string | null;
  active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}
export type PropertyOption = {
  id: string;
  name: string;
  capacity: number;
  status: string;
};
export type ReservationList = {
  items: Reservation[];
  properties: PropertyOption[];
  total: number;
  page: number;
};
export type BlockList = { items: PropertyBlock[]; total: number; page: number };
export type ReservationDetail = {
  reservation: Reservation;
  property: PropertyOption;
};
