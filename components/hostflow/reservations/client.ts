"use client";
import { useCallback, useEffect, useState } from "react";
export async function stayRequest<T>(
  path: string,
  org: string,
  options: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  params.set("organization_id", org);
  let response: Response;
  let data: unknown;
  try {
    response = await fetch("/api/reservations" + route + "?" + params, {
      method: options.method || "GET",
      headers: options.body
        ? { "Content-Type": "application/json" }
        : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    });
    data = await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof Error && error.name === "TimeoutError")
      throw new DOMException(
        "Le serveur met trop de temps à répondre. Vérifiez la liste avant de réessayer.",
        "TimeoutError",
      );
    if (error instanceof SyntaxError)
      throw new Error(
        "La réponse du serveur est illisible. Vérifiez la liste avant de réessayer.",
      );
    throw new Error(
      "Connexion interrompue. Vérifiez votre connexion puis la liste avant de réessayer.",
    );
  }
  if (!response.ok)
    throw new Error(
      data &&
        typeof data === "object" &&
        "error" in data &&
        typeof data.error === "string"
        ? data.error
        : "L’opération n’a pas abouti.",
    );
  return data as T;
}
export function useStayResource<T>(path: string, org: string) {
  const [revision, setRevision] = useState(0);
  const key = org + "|" + path + "|" + revision;
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string;
  }>({ key: "", data: null, error: "" });
  useEffect(() => {
    const controller = new AbortController();
    stayRequest<T>(path, org, { signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) setResult({ key, data, error: "" });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setResult({
            key,
            data: null,
            error: e instanceof Error ? e.message : "Connexion interrompue.",
          });
      });
    return () => controller.abort();
  }, [path, org, key]);
  const reload = useCallback(() => setRevision((x) => x + 1), []);
  return {
    data: result.key === key ? result.data : null,
    error: result.key === key ? result.error : "",
    loading: result.key !== key,
    reload,
  };
}
