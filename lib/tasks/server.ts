import { z } from "zod";
import { NextResponse } from "next/server";
import { serverSupabase, backendConfig } from "@/lib/supabase/server";
import { AppError, checkDb } from "@/lib/hostflow/errors";
import { safeOrigin } from "@/lib/hostflow/request-security";
import { canReadTasks, canManageTasks } from "./types";
import { taskInput, statusInput, taskFilters } from "./validation";
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    },
  });
function checked(e: { message: string; code?: string } | null) {
  if (!e) return;
  if (e.code === "23503")
    throw new AppError(
      "Le logement, la réservation ou le membre associé est invalide. La réservation doit appartenir au logement choisi.",
      400,
    );
  if (e.message.includes("task_assignee_unavailable"))
    throw new AppError("Choisissez un membre actif de cette organisation.");
  if (e.code === "23514")
    throw new AppError("Vérifiez les informations de la tâche.");
  checkDb(e, "tasks");
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Format invalide.", 415);
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Requête vide.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 16000) {
        await reader.cancel();
        throw new AppError("Requête trop volumineuse.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let i = 0;
  for (const c of chunks) {
    bytes.set(c, i);
    i += c.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new AppError("Requête invalide.");
  }
}

export async function handleTasks(request: Request, path: string[] = []) {
  try {
    const config = backendConfig();
    if (!config) throw new AppError("Service indisponible.", 503);
    if (
      request.method !== "GET" &&
      !safeOrigin(request.headers.get("origin"), request.url, config.appUrl)
    )
      throw new AppError("Requête non autorisée.", 403);
    const db = await serverSupabase();
    const auth = await db.auth.getUser();
    if (auth.error || !auth.data.user)
      throw new AppError("Connectez-vous pour accéder aux tâches.", 401);
    const params = new URL(request.url).searchParams;
    const org = z.string().uuid().parse(params.get("organization_id"));
    const member = await db
      .from("organization_members")
      .select("role")
      .eq("organization_id", org)
      .eq("user_id", auth.data.user.id)
      .eq("status", "active")
      .maybeSingle();
    checked(member.error);
    if (!member.data || !canReadTasks(member.data.role))
      throw new AppError(
        "Votre rôle ne permet pas de consulter les tâches.",
        403,
      );
    const manage = canManageTasks(member.data.role);
    if (path.length > 1) throw new AppError("Page introuvable.", 404);
    if (request.method === "GET" && path[0] === "options") {
      const properties = await db.rpc("task_property_names", {
        p_organization_id: org,
      });
      checked(properties.error);
      const members = manage
        ? await db
            .from("organization_members")
            .select("user_id,display_name,status")
            .eq("organization_id", org)
            .in("role", ["owner", "admin", "manager", "staff"])
            .order("display_name")
            .limit(1000)
        : { data: [], error: null };
      checked(members.error);
      const property = params.get("property_id");
      if (property) z.string().uuid().parse(property);
      const reservations =
        manage && property
          ? await db
              .from("reservations")
              .select("id,guest_name,check_in,check_out,status")
              .eq("organization_id", org)
              .eq("property_id", property)
              .order("check_in", { ascending: false })
              .limit(500)
          : { data: [], error: null };
      checked(reservations.error);
      return reply({
        properties: properties.data || [],
        members: members.data || [],
        reservations: reservations.data || [],
      });
    }
    const id = path[0];
    if (id) z.string().uuid().parse(id);
    if (request.method === "GET" && id) {
      const r = await db
        .from("tasks")
        .select("*")
        .eq("organization_id", org)
        .eq("id", id)
        .maybeSingle();
      checked(r.error);
      if (!r.data) throw new AppError("Tâche introuvable.", 404);
      return reply({ task: r.data });
    }
    if (request.method === "GET") {
      const f = taskFilters.parse(Object.fromEntries(params));
      let q = db
        .from("tasks")
        .select("*", { count: "exact" })
        .eq("organization_id", org);
      if (f.property_id) q = q.eq("property_id", f.property_id);
      if (f.reservation_id) q = q.eq("reservation_id", f.reservation_id);
      if (f.status === "open") q = q.in("status", ["todo", "in_progress"]);
      else if (f.status !== "all") q = q.eq("status", f.status);
      if (f.type !== "all") q = q.eq("type", f.type);
      if (f.priority !== "all") q = q.eq("priority", f.priority);
      if (f.assignee === "unassigned") q = q.is("assignee_id", null);
      else if (f.assignee !== "all")
        q = q.eq(
          "assignee_id",
          f.assignee === "mine" ? auth.data.user.id : f.assignee,
        );
      if (f.q) q = q.ilike("title", "%" + f.q.replace(/[\\%_]/g, "\\$&") + "%");
      if (f.period === "overdue")
        q = q
          .lt("scheduled_at", new Date().toISOString())
          .in("status", ["todo", "in_progress"]);
      if (f.period === "upcoming")
        q = q.gte("scheduled_at", new Date().toISOString());
      const r = await q
        .order("scheduled_at")
        .order("id")
        .range((f.page - 1) * 30, f.page * 30 - 1);
      checked(r.error);
      return reply({ items: r.data || [], total: r.count || 0, page: f.page });
    }
    if (request.method === "PATCH" && id) {
      const input = statusInput.parse(await body(request));
      if (!manage && input.status === "cancelled")
        throw new AppError("Seul un responsable peut annuler une tâche.", 403);
      const r = await db
        .from("tasks")
        .update({ status: input.status })
        .eq("organization_id", org)
        .eq("id", id)
        .eq("version", input.version)
        .select("*")
        .maybeSingle();
      checked(r.error);
      if (!r.data)
        throw new AppError(
          "Cette tâche a changé ou est inaccessible. Rechargez la liste.",
          409,
        );
      return reply({ task: r.data });
    }
    if (!manage)
      throw new AppError(
        "Seul un responsable peut créer ou modifier une tâche.",
        403,
      );
    if (!["POST", "PUT"].includes(request.method))
      throw new AppError("Méthode non autorisée.", 405);
    const { version, ...input } = taskInput.parse(await body(request));
    if (
      (request.method === "POST" && (id || version !== null)) ||
      (request.method === "PUT" && (!id || id !== input.id || version === null))
    )
      throw new AppError("Requête invalide.");
    const r =
      version === null
        ? await db
            .from("tasks")
            .insert({ ...input, organization_id: org })
            .select("*")
            .single()
        : await db
            .from("tasks")
            .update(input)
            .eq("organization_id", org)
            .eq("id", id!)
            .eq("version", version)
            .select("*")
            .maybeSingle();
    checked(r.error);
    if (!r.data)
      throw new AppError(
        "Cette tâche a changé. Rechargez avant de réessayer.",
        409,
      );
    return reply({ task: r.data }, version === null ? 201 : 200);
  } catch (e) {
    return reply(
      {
        error:
          e instanceof z.ZodError
            ? e.issues[0]?.message
            : e instanceof AppError
              ? e.message
              : "Le service est momentanément indisponible.",
      },
      e instanceof z.ZodError ? 400 : e instanceof AppError ? e.status : 503,
    );
  }
}
