import { handleTasks } from "@/lib/tasks/server";
export const dynamic = "force-dynamic";
async function handler(
  request: Request,
  context: { params: Promise<{ path?: string[] }> },
) {
  return handleTasks(request, (await context.params).path);
}
export { handler as GET, handler as POST, handler as PUT, handler as PATCH };
