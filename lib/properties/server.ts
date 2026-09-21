import { z } from "zod";
import { NextResponse } from "next/server";
import { serverSupabase, backendConfig } from "@/lib/supabase/server";
import { AppError, checkDb } from "@/lib/hostflow/server";
import { safeOrigin } from "@/lib/hostflow/request-security";
import {
  canEditProperties,
  MAX_PHOTO_BYTES,
  type PropertyDetail,
  type PropertyList,
} from "./types";
import {
  listSchema,
  savePropertySchema,
  archiveSchema,
  arrangeSchema,
  imageMime,
} from "./validation";
const bucket = "property-photos";
export const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
const reply = (data: unknown, status = 200) =>
  NextResponse.json(data, { status, headers: privateHeaders });
function propertyError(error: unknown) {
  if (error instanceof z.ZodError)
    return reply(
      { error: error.issues[0]?.message ?? "Vérifiez les informations." },
      400,
    );
  return reply(
    {
      error:
        error instanceof AppError
          ? error.message
          : "Le service est momentanément indisponible. Vos modifications ne sont pas perdues dans le formulaire.",
    },
    error instanceof AppError ? error.status : 503,
  );
}
function checked(error: { code?: string; message: string } | null) {
  if (!error) return;
  if (error.code === "PT409" || error.code === "40001")
    throw new AppError(
      "Ce logement a été modifié depuis votre ouverture. Rechargez sa fiche avant de réessayer.",
      409,
    );
  if (error.code === "P0002")
    throw new AppError(
      "Ce logement ou cette photo n’est plus disponible.",
      404,
    );
  if (error.message.includes("image_limit"))
    throw new AppError(
      "Vous pouvez ajouter au maximum 30 photos par logement.",
    );
  if (error.message.includes("property_archived"))
    throw new AppError("Restaurez ce logement avant de le modifier.", 409);
  if (error.code === "23503")
    throw new AppError(
      "Un équipement sélectionné n’est plus disponible. Rechargez le formulaire.",
      409,
    );
  if (error.code === "23514" || error.code === "22023")
    throw new AppError("Vérifiez les valeurs saisies et réessayez.");
  checkDb(error);
}
async function context(request: Request) {
  const config = backendConfig();
  if (!config)
    throw new AppError("La connexion au service est indisponible.", 503);
  if (
    request.method !== "GET" &&
    !safeOrigin(request.headers.get("origin"), request.url, config.appUrl)
  )
    throw new AppError("Requête non autorisée.", 403);
  const db = await serverSupabase();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user)
    throw new AppError("Connectez-vous pour accéder aux logements.", 401);
  const organizationId = z
    .string()
    .uuid("Organisation invalide.")
    .parse(new URL(request.url).searchParams.get("organization_id"));
  const membership = await db
    .from("organization_members")
    .select("role")
    .eq("organization_id", organizationId)
    .eq("user_id", data.user.id)
    .eq("status", "active")
    .maybeSingle();
  checked(membership.error);
  if (!membership.data || !canEditProperties(membership.data.role))
    throw new AppError(
      "Votre rôle ne permet pas d’accéder au portefeuille de logements.",
      403,
    );
  return { db, organizationId };
}
type Context = Awaited<ReturnType<typeof context>>;
async function boundedBytes(request: Request, max: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new AppError("Requête vide.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        await reader.cancel();
        throw new AppError(
          "Le fichier ou la requête dépasse la taille autorisée.",
          413,
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
async function body(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AppError("Format de requête invalide.", 415);
  try {
    return JSON.parse(
      new TextDecoder().decode(await boundedBytes(request, 48000)),
    ) as unknown;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Requête invalide.");
  }
}
async function getProperty(ctx: Context, id: string) {
  z.string().uuid().parse(id);
  const result = await ctx.db
    .from("properties")
    .select("*")
    .eq("organization_id", ctx.organizationId)
    .eq("id", id)
    .maybeSingle();
  checked(result.error);
  if (!result.data)
    throw new AppError("Ce logement est introuvable ou inaccessible.", 404);
  return result.data;
}
async function detail(ctx: Context, id: string): Promise<PropertyDetail> {
  const property = await getProperty(ctx, id);
  const [amenities, catalog, images] = await Promise.all([
    ctx.db
      .from("property_amenities")
      .select("amenity_id")
      .eq("organization_id", ctx.organizationId)
      .eq("property_id", id),
    ctx.db.from("amenities").select("*").order("sort_order"),
    ctx.db
      .from("property_images")
      .select("*")
      .eq("organization_id", ctx.organizationId)
      .eq("property_id", id)
      .order("sort_order")
      .order("id"),
  ]);
  [amenities, catalog, images].forEach((x) => checked(x.error));
  return {
    property,
    amenities: (amenities.data ?? []).map((x) => x.amenity_id),
    catalog: catalog.data ?? [],
    images: images.data ?? [],
  };
}
async function list(ctx: Context, request: Request): Promise<PropertyList> {
  const input = listSchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  let query = ctx.db
    .from("properties")
    .select(
      "id,name,internal_name,status,city,country,property_type,capacity,bedrooms,owner_id,created_at,updated_at",
      { count: "exact" },
    )
    .eq("organization_id", ctx.organizationId);
  if (input.search)
    query = query.ilike(
      "search_text",
      "%" + input.search.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%",
    );
  if (input.status !== "all") query = query.eq("status", input.status);
  if (input.city) query = query.eq("city", input.city);
  if (input.type !== "all") query = query.eq("property_type", input.type);
  const sortColumn = (
    {
      newest: "created_at",
      name: "name",
      city: "city",
      capacity: "capacity",
    } as const
  )[input.sort];
  const start = (input.page - 1) * input.pageSize;
  const [result, cities] = await Promise.all([
    query
      .order(sortColumn, { ascending: input.sort !== "newest" })
      .order("id")
      .range(start, start + input.pageSize - 1),
    ctx.db.rpc("property_filter_cities", {
      p_organization_id: ctx.organizationId,
    }),
  ]);
  checked(result.error);
  checked(cities.error);
  const ids = (result.data ?? []).map((x) => x.id);
  const covers = ids.length
    ? await ctx.db
        .from("property_images")
        .select("id,property_id")
        .eq("organization_id", ctx.organizationId)
        .eq("is_cover", true)
        .eq("state", "ready")
        .in("property_id", ids)
    : { data: [], error: null };
  checked(covers.error);
  return {
    items: (result.data ?? []).map((x) => ({
      ...x,
      cover_id: covers.data?.find((i) => i.property_id === x.id)?.id ?? null,
    })),
    total: result.count ?? 0,
    page: input.page,
    pageSize: input.pageSize,
    cities: cities.data ?? [],
  };
}
async function upload(ctx: Context, request: Request, id: string) {
  const property = await getProperty(ctx, id);
  if (property.status === "archived")
    throw new AppError(
      "Restaurez ce logement avant d’ajouter des photos.",
      409,
    );
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data"))
    throw new AppError("Sélectionnez une image.", 415);
  const bytes = await boundedBytes(request, MAX_PHOTO_BYTES + 65536);
  let form: FormData;
  try {
    form = await new Request(request.url, {
      method: "POST",
      headers: request.headers,
      body: bytes.buffer,
    }).formData();
  } catch {
    throw new AppError("Envoi de fichier invalide.");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size < 1)
    throw new AppError("Sélectionnez une image.");
  if (file.size > MAX_PHOTO_BYTES)
    throw new AppError("Chaque photo doit peser au maximum 5 Mo.", 413);
  const imageBytes = new Uint8Array(await file.arrayBuffer());
  const mime = imageMime(imageBytes);
  if (!mime || file.type !== mime)
    throw new AppError(
      "Formats acceptés : JPEG, PNG et WebP. Le contenu du fichier doit correspondre à son format.",
      415,
    );
  const imageId = crypto.randomUUID();
  const reservation = await ctx.db.rpc("reserve_property_image", {
    p_organization_id: ctx.organizationId,
    p_property_id: id,
    p_id: imageId,
    p_content_type: mime,
    p_size_bytes: file.size,
  });
  checked(reservation.error);
  if (!reservation.data)
    throw new AppError("L’envoi n’a pas pu être préparé.", 503);
  const stored = await ctx.db.storage
    .from(bucket)
    .upload(reservation.data, imageBytes, {
      contentType: mime,
      upsert: false,
      cacheControl: "0",
    });
  if (stored.error) {
    // A pending row stays recoverable if Storage cannot confirm cleanup.
    const cleanup = await ctx.db.storage
      .from(bucket)
      .remove([reservation.data]);
    if (!cleanup.error)
      await ctx.db
        .from("property_images")
        .delete()
        .eq("id", imageId)
        .eq("organization_id", ctx.organizationId);
    throw new AppError(
      "L’envoi a échoué. Réessayez ; une photo interrompue peut être supprimée depuis la galerie.",
      503,
    );
  }
  const finished = await ctx.db.rpc("finish_property_image", {
    p_organization_id: ctx.organizationId,
    p_property_id: id,
    p_image_id: imageId,
  });
  checked(finished.error);
  return reply({ ok: true, imageId });
}
export async function handleProperties(
  request: Request,
  path: string[] = [],
): Promise<Response> {
  try {
    const ctx = await context(request);
    const [id, part, imageId] = path;
    if (path.length > 3) throw new AppError("Page introuvable.", 404);
    if (id === "catalog" && path.length === 1 && request.method === "GET") {
      const result = await ctx.db
        .from("amenities")
        .select("*")
        .order("sort_order");
      checked(result.error);
      return reply(result.data ?? []);
    }
    if (!id) {
      if (request.method === "GET") return reply(await list(ctx, request));
      if (request.method === "POST") {
        const input = savePropertySchema.parse(await body(request));
        if (input.version !== null) throw new AppError("Création invalide.");
        const result = await ctx.db.rpc("save_property", {
          p_organization_id: ctx.organizationId,
          p_id: input.id,
          p_data: input.property,
          p_amenities: input.amenities,
          p_expected_version: null,
        });
        checked(result.error);
        return reply(await detail(ctx, input.id), 201);
      }
    } else {
      z.string().uuid().parse(id);
      if (!part) {
        if (request.method === "GET") return reply(await detail(ctx, id));
        if (request.method === "PUT") {
          const input = savePropertySchema.parse(await body(request));
          if (input.id !== id || input.version === null)
            throw new AppError("Modification invalide.");
          const result = await ctx.db.rpc("save_property", {
            p_organization_id: ctx.organizationId,
            p_id: id,
            p_data: input.property,
            p_amenities: input.amenities,
            p_expected_version: input.version,
          });
          checked(result.error);
          return reply(await detail(ctx, id));
        }
        if (request.method === "PATCH") {
          const input = archiveSchema.parse(await body(request));
          const r = await ctx.db.rpc("set_property_archived", {
            p_organization_id: ctx.organizationId,
            p_id: id,
            p_archived: input.archived,
            p_expected_version: input.version,
          });
          checked(r.error);
          return reply({ ok: true });
        }
      } else if (part === "images") {
        if (!imageId) {
          if (request.method === "POST") return await upload(ctx, request, id);
          if (request.method === "PATCH") {
            const input = arrangeSchema.parse(await body(request));
            const r = await ctx.db.rpc("arrange_property_images", {
              p_organization_id: ctx.organizationId,
              p_property_id: id,
              p_order: input.order,
              p_cover: input.cover,
            });
            checked(r.error);
            return reply({ ok: true });
          }
        } else {
          z.string().uuid().parse(imageId);
          if (request.method === "GET") {
            const row = await ctx.db
              .from("property_images")
              .select("storage_path,content_type")
              .eq("organization_id", ctx.organizationId)
              .eq("property_id", id)
              .eq("id", imageId)
              .eq("state", "ready")
              .maybeSingle();
            checked(row.error);
            if (!row.data) throw new AppError("Photo inaccessible.", 404);
            const file = await ctx.db.storage
              .from(bucket)
              .download(row.data.storage_path);
            if (file.error || !file.data)
              throw new AppError("Photo indisponible.", 404);
            return new Response(file.data, {
              headers: {
                ...privateHeaders,
                "Content-Type": row.data.content_type,
                "Content-Security-Policy": "default-src 'none'; sandbox",
              },
            });
          }
          if (request.method === "DELETE") {
            const prepared = await ctx.db.rpc("prepare_property_image_delete", {
              p_organization_id: ctx.organizationId,
              p_property_id: id,
              p_image_id: imageId,
            });
            checked(prepared.error);
            if (!prepared.data) throw new AppError("Photo introuvable.", 404);
            const removed = await ctx.db.storage
              .from(bucket)
              .remove([prepared.data]);
            if (removed.error)
              throw new AppError(
                "La suppression du fichier a échoué. Vous pouvez réessayer.",
                503,
              );
            const deleted = await ctx.db
              .from("property_images")
              .delete()
              .eq("organization_id", ctx.organizationId)
              .eq("property_id", id)
              .eq("id", imageId);
            checked(deleted.error);
            return reply({ ok: true });
          }
        }
      }
    }
    throw new AppError("Opération indisponible.", 405);
  } catch (error) {
    return propertyError(error);
  }
}
