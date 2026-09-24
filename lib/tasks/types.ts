import { canEditProperties } from "@/lib/properties/types";
import type { StoredRole } from "@/lib/hostflow/types";
export const canManageTasks = canEditProperties;
export const canReadTasks = (role?: StoredRole) =>
  canManageTasks(role) || role === "staff";
export const taskTypes = {
  cleaning: "Ménage",
  check_in: "Check-in",
  check_out: "Check-out",
  maintenance: "Maintenance",
  internal: "Tâche interne",
} as const;
export const taskStatuses = {
  todo: "À faire",
  in_progress: "En cours",
  done: "Terminée",
  cancelled: "Annulée",
} as const;
export const taskPriorities = {
  low: "Basse",
  normal: "Normale",
  high: "Haute",
  urgent: "Urgente",
} as const;
export interface Task {
  id: string;
  organization_id: string;
  property_id: string;
  reservation_id: string | null;
  assignee_id: string | null;
  type: keyof typeof taskTypes;
  title: string;
  description: string | null;
  scheduled_at: string;
  status: keyof typeof taskStatuses;
  priority: keyof typeof taskPriorities;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
}
export interface TaskOptions {
  properties: { id: string; name: string }[];
  members: { user_id: string; display_name: string; status: string }[];
  reservations: {
    id: string;
    guest_name: string;
    check_in: string;
    check_out: string;
    status: string;
  }[];
}
export interface TaskList {
  items: Task[];
  total: number;
  page: number;
}
