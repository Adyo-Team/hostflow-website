import { z } from "zod";
import { propertyTypes } from "./types";
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => v || null);
const number = (min: number, max: number) =>
  z.number().finite().min(min).max(max);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Utilisez une heure au format HH:MM.");
export const propertyFields = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Le nom doit contenir au moins deux caractères.")
      .max(150),
    internal_name: optionalText(150),
    status: z.enum(["active", "inactive"]),
    address_line1: z.string().trim().min(1, "Renseignez l’adresse.").max(250),
    address_line2: optionalText(250),
    postal_code: optionalText(30),
    city: z.string().trim().min(1, "Renseignez la ville.").max(100),
    country: z.string().regex(/^[A-Z]{2}$/, "Choisissez un pays."),
    latitude: number(-90, 90).nullable(),
    longitude: number(-180, 180).nullable(),
    property_type: z.enum(propertyTypes),
    capacity: number(1, 1000).int("La capacité doit être un entier."),
    bedrooms: number(0, 1000).int(),
    beds: number(0, 1000).int(),
    bathrooms: number(0, 1000).multipleOf(0.1),
    check_in_time: time,
    check_out_time: time,
    wifi_name: optionalText(150),
    wifi_password: optionalText(250),
    access_instructions: optionalText(5000),
    cleaning_instructions: optionalText(5000),
    private_notes: optionalText(5000),
    cleaning_fee: number(0, 9999999999.99).multipleOf(0.01).nullable(),
    management_commission_percent: number(0, 100).multipleOf(0.01).nullable(),
  })
  .strict();
export const propertySchema = propertyFields.refine(
  (v) => (v.latitude === null) === (v.longitude === null),
  {
    message: "Renseignez la latitude et la longitude ensemble.",
    path: ["latitude"],
  },
);
export type PropertyInput = z.infer<typeof propertyFields>;
export const savePropertySchema = z
  .object({
    id: z.string().uuid(),
    property: propertySchema,
    amenities: z.array(z.string().regex(/^[a-z][a-z0-9_]{1,59}$/)).max(100),
    version: z.number().int().positive().nullable(),
  })
  .strict();
export const archiveSchema = z
  .object({ archived: z.boolean(), version: z.number().int().positive() })
  .strict();
export const arrangeSchema = z
  .object({
    order: z.array(z.string().uuid()).min(1).max(30),
    cover: z.string().uuid(),
  })
  .strict();
export const listSchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["all", "active", "inactive", "archived"]).default("active"),
  city: z.string().trim().max(100).default(""),
  type: z.enum(["all", ...propertyTypes]).default("all"),
  sort: z.enum(["newest", "name", "city", "capacity"]).default("newest"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});
export const defaultProperty = (country = "BE"): PropertyInput => ({
  name: "",
  internal_name: null,
  status: "active",
  address_line1: "",
  address_line2: null,
  postal_code: null,
  city: "",
  country,
  latitude: null,
  longitude: null,
  property_type: "apartment",
  capacity: 1,
  bedrooms: 0,
  beds: 1,
  bathrooms: 1,
  check_in_time: "15:00",
  check_out_time: "11:00",
  wifi_name: null,
  wifi_password: null,
  access_instructions: null,
  cleaning_instructions: null,
  private_notes: null,
  cleaning_fee: null,
  management_commission_percent: null,
});
// Inspect the bytes, not merely the extension or browser-supplied MIME type.
export function imageMime(
  bytes: Uint8Array,
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => bytes[i] === v)
  )
    return "image/png";
  if (
    bytes.length >= 12 &&
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
