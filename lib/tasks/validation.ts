import { z } from "zod";
export const taskInput = z
  .object({
    id: z.string().uuid(),
    version: z.number().int().positive().nullable(),
    property_id: z.string().uuid(),
    reservation_id: z.string().uuid().nullable(),
    assignee_id: z.string().uuid().nullable(),
    type: z.enum([
      "cleaning",
      "check_in",
      "check_out",
      "maintenance",
      "internal",
    ]),
    title: z.string().trim().min(1, "Indiquez un titre.").max(150),
    description: z.string().trim().max(5000).nullable(),
    scheduled_at: z.string().datetime({ offset: true }),
    status: z.enum(["todo", "in_progress", "done", "cancelled"]),
    priority: z.enum(["low", "normal", "high", "urgent"]),
  })
  .strict();
export const statusInput = z
  .object({
    version: z.number().int().positive(),
    status: z.enum(["todo", "in_progress", "done", "cancelled"]),
  })
  .strict();
export const taskFilters = z.object({
  organization_id: z.string().uuid(),
  property_id: z.string().uuid().optional(),
  reservation_id: z.string().uuid().optional(),
  assignee: z
    .union([z.enum(["all", "mine", "unassigned"]), z.string().uuid()])
    .default("all"),
  type: z
    .enum([
      "all",
      "cleaning",
      "check_in",
      "check_out",
      "maintenance",
      "internal",
    ])
    .default("all"),
  status: z
    .enum(["all", "open", "todo", "in_progress", "done", "cancelled"])
    .default("open"),
  priority: z.enum(["all", "low", "normal", "high", "urgent"]).default("all"),
  period: z.enum(["all", "overdue", "upcoming"]).default("all"),
  q: z.string().trim().max(150).default(""),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
