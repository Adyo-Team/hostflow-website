import type { StoredRole } from "@/lib/hostflow/types";
export const propertyTypes = [
  "apartment",
  "house",
  "villa",
  "studio",
  "loft",
  "other",
] as const;
export const propertyStatuses = ["active", "inactive", "archived"] as const;
export type PropertyType = (typeof propertyTypes)[number];
export type PropertyStatus = (typeof propertyStatuses)[number];
export const typeLabels: Record<PropertyType, string> = {
  apartment: "Appartement",
  house: "Maison",
  villa: "Villa",
  studio: "Studio",
  loft: "Loft",
  other: "Autre",
};
export const statusLabels: Record<PropertyStatus, string> = {
  active: "Actif",
  inactive: "Inactif",
  archived: "Archivé",
};
export const canEditProperties = (role?: StoredRole) =>
  role === "owner" || role === "admin" || role === "manager";
export const canArchiveProperties = (role?: StoredRole) =>
  role === "owner" || role === "admin";
export interface Property {
  id: string;
  organization_id: string;
  owner_id: string | null;
  name: string;
  internal_name: string | null;
  status: PropertyStatus;
  address_line1: string;
  address_line2: string | null;
  postal_code: string | null;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  property_type: PropertyType;
  capacity: number;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  check_in_time: string;
  check_out_time: string;
  wifi_name: string | null;
  wifi_password: string | null;
  access_instructions: string | null;
  cleaning_instructions: string | null;
  private_notes: string | null;
  cleaning_fee: number | null;
  management_commission_percent: number | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  version: number;
}
export interface Amenity {
  id: string;
  name: string;
  category: string;
  sort_order: number;
}
export interface PropertyImage {
  id: string;
  organization_id: string;
  property_id: string;
  storage_path: string;
  sort_order: number;
  is_cover: boolean;
  state: "pending" | "ready" | "deleting";
  content_type: string;
  size_bytes: number;
  created_at: string;
  created_by: string;
}
export interface PropertyDetail {
  property: Property;
  amenities: string[];
  catalog: Amenity[];
  images: PropertyImage[];
}
export type PropertySummary = Pick<
  Property,
  | "id"
  | "name"
  | "internal_name"
  | "status"
  | "city"
  | "country"
  | "property_type"
  | "capacity"
  | "bedrooms"
  | "owner_id"
  | "created_at"
  | "updated_at"
> & { cover_id: string | null };
export interface PropertyList {
  items: PropertySummary[];
  total: number;
  page: number;
  pageSize: number;
  cities: string[];
}
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PHOTOS = 30;
export const photoUrl = (org: string, property: string, image: string) =>
  `/api/properties/${property}/images/${image}?organization_id=${encodeURIComponent(org)}`;
