import { z } from "zod";
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide.")
  .refine((v) => {
    const d = new Date(v + "T12:00:00Z");
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Date invalide.");
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);
export const reservationInput = z
  .object({
    id: z.string().uuid(),
    property_id: z.string().uuid("Choisissez un logement."),
    check_in: date,
    check_out: date,
    status: z.enum(["confirmed", "cancelled"]),
    source: z.literal("manual"),
    guest_name: z
      .string()
      .trim()
      .min(1, "Indiquez le nom du voyageur.")
      .max(150),
    guest_email: z
      .union([
        z.string().trim().email("Adresse email invalide.").max(254),
        z.literal(""),
        z.null(),
      ])
      .optional()
      .transform((v) => v || null),
    guest_phone: optionalText(50),
    guests_count: z.number().int().min(1).max(1000),
    internal_notes: optionalText(5000),
    version: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((v) => v.check_out > v.check_in, {
    message: "Le départ doit être après l’arrivée.",
    path: ["check_out"],
  });
export const blockInput = z
  .object({
    id: z.string().uuid(),
    property_id: z.string().uuid("Choisissez un logement."),
    start_date: date,
    end_date: date,
    reason: z.enum(["owner", "works", "maintenance", "internal"]),
    notes: optionalText(5000),
    active: z.boolean(),
    version: z.number().int().positive().nullable(),
  })
  .strict()
  .refine((v) => v.end_date > v.start_date, {
    message: "La fin doit être après le début du blocage.",
    path: ["end_date"],
  });
export const stayListInput = z.object({
  property_id: z.string().uuid().optional(),
  q: z.string().trim().max(150).default(""),
  status: z.enum(["all", "confirmed", "cancelled"]).default("all"),
  period: z.enum(["all", "upcoming", "past"]).default("all"),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  active: z.enum(["all", "true", "false"]).default("all"),
});
