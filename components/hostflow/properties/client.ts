"use client";
import { useCallback, useEffect, useState } from "react";
export class PropertyRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function propertyRequest<T>(
  path: string,
  organizationId: string,
  options: {
    method?: string;
    body?: unknown;
    file?: File;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const [pathname, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("organization_id", organizationId);
  const form = options.file ? new FormData() : null;
  if (form && options.file) form.set("file", options.file);
  const response = await fetch(
    "/api/properties" + pathname + "?" + params.toString(),
    {
      method: options.method ?? "GET",
      headers: form
        ? undefined
        : options.body
          ? { "Content-Type": "application/json" }
          : undefined,
      body: form ?? (options.body ? JSON.stringify(options.body) : undefined),
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    },
  );
  const result: unknown = await response.json();
  if (!response.ok)
    throw new PropertyRequestError(
      result &&
        typeof result === "object" &&
        "error" in result &&
        typeof result.error === "string"
        ? result.error
        : "L’opération n’a pas abouti. Réessayez.",
      response.status,
    );
  return result as T;
}
export function usePropertyResource<T>(path: string, organizationId: string) {
  const [revision, setRevision] = useState(0);
  const key = organizationId + "|" + path;
  const [resource, setResource] = useState<{
    key: string;
    organizationId: string;
    revision: number;
    data: T | null;
    error: string;
  }>({ key: "", organizationId: "", revision: -1, data: null, error: "" });
  const reload = useCallback(() => setRevision((x) => x + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    void propertyRequest<T>(path, organizationId, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted)
          setResource({ key, organizationId, revision, data, error: "" });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setResource({
            key,
            organizationId,
            revision,
            data: null,
            error: e instanceof Error ? e.message : "Connexion interrompue.",
          });
      });
    return () => controller.abort();
  }, [path, organizationId, key, revision]);
  const current = resource.key === key;
  return {
    data: current ? resource.data : null,
    // Stable query facets may use the last response while the results reload.
    // Never carry even a previous response across an organization boundary.
    previousData:
      resource.organizationId === organizationId ? resource.data : null,
    error: current ? resource.error : "",
    loading: !current || (!resource.data && resource.revision !== revision),
    refreshing: !current || resource.revision !== revision,
    reload,
  };
}
