import type { PropertyOption, Reservation, PropertyBlock } from "@/lib/reservations/types";
export type CalendarData = {
  properties: PropertyOption[];
  reservations: Pick<Reservation, "id" | "property_id" | "guest_name" | "check_in" | "check_out" | "status">[];
  blocks: Pick<PropertyBlock, "id" | "property_id" | "start_date" | "end_date" | "reason">[];
  total: number;
};
