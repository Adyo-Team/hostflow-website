import { z } from "zod";
import { NextResponse } from "next/server";
import { serverSupabase, backendConfig } from "@/lib/supabase/server";
import { AppError, checkDb } from "@/lib/hostflow/errors";
import { safeOrigin } from "@/lib/hostflow/request-security";
import { canManageReservations } from "./types";
import { reservationInput, blockInput, stayListInput } from "./validation";
import { validDate, dayDistance } from "@/lib/calendar/dates.mjs";
const headers = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers });
function checked(e: { message: string; code?: string } | null) {
  if (!e) return;
  if (e.code === "23P01")
    throw new AppError(
      "Ce logement est indisponible sur ces dates : une réservation ou un blocage existe déjà. Choisissez d’autres dates.",
      409,
    );
  if (e.message.includes("capacity_exceeded"))
    throw new AppError(
      "Le nombre de voyageurs dépasse la capacité du logement.",
    );
  if (e.message.includes("property_not_active"))
    throw new AppError(
      "Ce logement n’est pas actif. Réactivez-le avant de réserver ou de le bloquer.",
      409,
    );
  if (e.code === "23503")
    throw new AppError("Le logement est introuvable ou inaccessible.", 404);
  if (e.code === "23514" || e.code === "22007")
    throw new AppError("Vérifiez les dates et les informations saisies.");
  checkDb(e, "reservations");
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
export async function handleReservations(
  request: Request,
  path: string[] = [],
) {
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
      throw new AppError("Connectez-vous pour accéder aux réservations.", 401);
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
    if (!member.data || !canManageReservations(member.data.role))
      throw new AppError(
        "Votre rôle ne permet pas de gérer les réservations.",
        403,
      );
    if (path.length > 2) throw new AppError("Page introuvable.", 404);
    if (request.method === "GET" && path.length === 1 && path[0] === "calendar") {
      const start = params.get("start") || "";
      const end = params.get("end") || "";
      const page = z.coerce.number().int().min(1).max(10000).parse(params.get("page") || 1);
      if (!validDate(start) || !validDate(end) || dayDistance(start, end) < 1 || dayDistance(start, end) > 31)
        throw new AppError("Choisissez une période valide de 1 à 31 jours.");
      const properties = await db.from("properties").select("id,name,capacity,status", { count: "exact" })
        .eq("organization_id", org).neq("status", "archived").order("name").order("id").range((page - 1) * 30, page * 30 - 1);
      checked(properties.error);
      const ids = (properties.data || []).map(p => p.id);
      // Page resources, not days. Never silently truncate a busy period at the API row limit.
      async function collect(kind: "reservations" | "property_blocks") {
        const rows = [];
        for (let offset = 0; offset < 10000; offset += 500) {
          const q = kind === "reservations"
            ? db.from("reservations").select("id,property_id,guest_name,check_in,check_out,status").eq("status", "confirmed").lt("check_in", end).gt("check_out", start)
            : db.from("property_blocks").select("id,property_id,start_date,end_date,reason").eq("active", true).lt("start_date", end).gt("end_date", start);
          const r = await q.eq("organization_id", org).in("property_id", ids).order("id").range(offset, offset + 499);
          checked(r.error);
          rows.push(...(r.data || []));
          if ((r.data || []).length < 500) return rows;
        }
        throw new AppError("Trop de séjours sur cette période. Réduisez la période affichée.", 422);
      }
      const [reservations, blocks] = ids.length ? await Promise.all([collect("reservations"), collect("property_blocks")]) : [[], []];
      return reply({ properties: properties.data || [], total: properties.count || 0, reservations, blocks });
    }
    const isBlock = path[0] === "blocks";
    const id = isBlock ? path[1] : path[0];
    if (request.method === "GET" && path[0] === "options") {
      const r = await db
        .from("properties")
        .select("id,name,capacity,status")
        .eq("organization_id", org)
        .neq("status", "archived")
        .order("name")
        .limit(1000);
      checked(r.error);
      return reply({ properties: r.data });
    }
    if (id) z.string().uuid().parse(id);
    if (request.method === "GET" && id) {
      if (isBlock) {
        const r = await db
          .from("property_blocks")
          .select("*")
          .eq("organization_id", org)
          .eq("id", id)
          .maybeSingle();
        checked(r.error);
        if (!r.data) throw new AppError("Blocage introuvable.", 404);
        return reply({ block: r.data });
      }
      const r = await db
        .from("reservations")
        .select("*")
        .eq("organization_id", org)
        .eq("id", id)
        .maybeSingle();
      checked(r.error);
      if (!r.data) throw new AppError("Réservation introuvable.", 404);
      const p = await db
        .from("properties")
        .select("id,name,capacity,status")
        .eq("organization_id", org)
        .eq("id", r.data.property_id)
        .single();
      checked(p.error);
      return reply({ reservation: r.data, property: p.data });
    }
    if (request.method === "GET") {
      const f = stayListInput.parse(Object.fromEntries(params));
      const from = (f.page - 1) * 30;
      if (isBlock) {
        let q = db
          .from("property_blocks")
          .select("*", { count: "exact" })
          .eq("organization_id", org);
        if (f.property_id) q = q.eq("property_id", f.property_id);
        if (f.active !== "all") q = q.eq("active", f.active === "true");
        const r = await q
          .order("start_date")
          .order("id")
          .range(from, from + 29);
        checked(r.error);
        return reply({ items: r.data, total: r.count, page: f.page });
      }
      let q = db
        .from("reservations")
        .select("*", { count: "exact" })
        .eq("organization_id", org);
      if (f.property_id) q = q.eq("property_id", f.property_id);
      if (f.status !== "all") q = q.eq("status", f.status);
      if (f.q)
        q = q.ilike("guest_name", "%" + f.q.replace(/[\\%_]/g, "\\$&") + "%");
      const organization = await db
        .from("organizations")
        .select("timezone")
        .eq("id", org)
        .single();
      checked(organization.error);
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: organization.data?.timezone || "UTC",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (f.period === "upcoming") q = q.gt("check_out", today);
      if (f.period === "past") q = q.lte("check_out", today);
      const r = await q
        .order("check_in", { ascending: f.period !== "past" })
        .order("id")
        .range(from, from + 29);
      checked(r.error);
      const ids = [...new Set(r.data?.map((x) => x.property_id))];
      const p = ids.length
        ? await db
            .from("properties")
            .select("id,name,capacity,status")
            .eq("organization_id", org)
            .in("id", ids)
        : { data: [], error: null };
      checked(p.error);
      return reply({
        items: r.data,
        properties: p.data,
        total: r.count,
        page: f.page,
      });
    }
    if (!["POST", "PUT"].includes(request.method))
      throw new AppError("Méthode non autorisée.", 405);
    if ((request.method === "POST" && id) || (request.method === "PUT" && !id))
      throw new AppError("Route invalide.", 400);
    if (isBlock) {
      const { version, ...input } = blockInput.parse(await body(request));
      if (id && input.id !== id) throw new AppError("Identifiant invalide.");
      if ((request.method === "POST") !== (version === null))
        throw new AppError("Version invalide.");
      const r =
        version === null
          ? await db
              .from("property_blocks")
              .insert({ ...input, organization_id: org })
              .select("*")
              .single()
          : await db
              .from("property_blocks")
              .update(input)
              .eq("organization_id", org)
              .eq("id", id!)
              .eq("version", version)
              .select("*")
              .maybeSingle();
      checked(r.error);
      if (!r.data)
        throw new AppError(
          "Ce blocage a changé. Rechargez avant de réessayer.",
          409,
        );
      return reply({ block: r.data }, version === null ? 201 : 200);
    }
    const { version, ...input } = reservationInput.parse(await body(request));
    if (id && input.id !== id) throw new AppError("Identifiant invalide.");
    if ((request.method === "POST") !== (version === null))
      throw new AppError("Version invalide.");
    const r =
      version === null
        ? await db
            .from("reservations")
            .insert({ ...input, organization_id: org })
            .select("*")
            .single()
        : await db
            .from("reservations")
            .update(input)
            .eq("organization_id", org)
            .eq("id", id!)
            .eq("version", version)
            .select("*")
            .maybeSingle();
    checked(r.error);
    if (!r.data)
      throw new AppError(
        "Cette réservation a changé. Rechargez avant de réessayer.",
        409,
      );
    return reply({ reservation: r.data }, version === null ? 201 : 200);
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
