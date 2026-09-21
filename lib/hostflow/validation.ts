import { z } from "zod";
import { roles } from "./types";
const name = z.string().trim().min(2, "Deux caractères minimum.").max(100);
const personName = z
  .string()
  .trim()
  .min(1, "Renseignez votre prénom et votre nom.")
  .max(100);
const email = z
  .string()
  .trim()
  .email("Adresse email invalide.")
  .max(254)
  .transform((v) => v.toLowerCase());
const password = z
  .string()
  .min(12, "Utilisez au moins 12 caractères.")
  .max(128);
const org = z.string().uuid();
export const countries = [
  "BE",
  "FR",
  "MA",
  "CH",
  "CA",
  "US",
  "GB",
  "LU",
  "NL",
  "DE",
  "ES",
  "IT",
  "PT",
  "AE",
  "TN",
  "DZ",
] as const;
const country = z.enum(countries);
const timezone = z
  .string()
  .min(1)
  .max(100)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat("fr", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Fuseau horaire invalide.");
export const currencies = ["EUR", "USD", "GBP", "MAD", "CHF", "CAD"] as const;
export type Currency = (typeof currencies)[number];
export type Country = (typeof countries)[number];
const currency = z.enum(currencies);
export const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("login"),
    email,
    password: z.string().min(1).max(128),
  }),
  z.object({
    action: z.literal("signup"),
    email,
    password,
    firstName: personName,
    lastName: personName,
  }),
  z.object({ action: z.literal("forgotPassword"), email }),
  z.object({ action: z.literal("resetPassword"), password }),
  z.object({ action: z.literal("logout") }),
  z.object({
    action: z.literal("createOrganization"),
    name,
    slug: z
      .string()
      .trim()
      .min(3)
      .max(60)
      .regex(
        /^[a-z0-9]+(-[a-z0-9]+)*$/,
        "Utilisez des minuscules, chiffres et tirets.",
      ),
    timezone,
    currency,
    country,
  }),
  z.object({ action: z.literal("switchOrganization"), organizationId: org }),
  z.object({
    action: z.literal("updateOrganization"),
    organizationId: org,
    name,
    timezone,
    currency,
    country,
  }),
  z.object({
    action: z.literal("updateProfile"),
    firstName: personName,
    lastName: personName,
    phone: z.string().trim().max(30),
  }),
  z.object({
    action: z.literal("updateMembership"),
    organizationId: org,
    membershipId: org,
    role: z.enum(roles),
    status: z.enum(["active", "suspended"]),
  }),
  z.object({
    action: z.literal("removeMember"),
    organizationId: org,
    membershipId: org,
  }),
  z.object({
    action: z.literal("createInvitation"),
    organizationId: org,
    email,
    role: z.enum(["admin", "manager", "staff"]),
  }),
  z.object({
    action: z.literal("revokeInvitation"),
    organizationId: org,
    invitationId: org,
  }),
  z.object({
    action: z.literal("acceptInvitation"),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  }),
  z.object({ action: z.literal("completeTeamSetup"), organizationId: org }),
]);
export type Mutation = z.infer<typeof mutationSchema>;
