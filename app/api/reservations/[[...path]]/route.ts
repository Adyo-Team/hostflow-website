import { handleReservations } from "@/lib/reservations/server";
export const dynamic = "force-dynamic";
async function handler(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return handleReservations(request, (await context.params).path);
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
