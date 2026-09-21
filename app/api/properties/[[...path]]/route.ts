import { handleProperties } from "@/lib/properties/server";
export const dynamic = "force-dynamic";
type RouteContext = { params: Promise<{ path?: string[] }> };
async function handler(request: Request, context: RouteContext) {
  return handleProperties(request, (await context.params).path);
}
export {
  handler as GET,
  handler as POST,
  handler as PUT,
  handler as PATCH,
  handler as DELETE,
};
