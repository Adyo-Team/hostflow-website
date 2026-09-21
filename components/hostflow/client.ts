"use client";
import {
  createContext,
  createElement,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { emptyWorkspace, type WorkspaceState } from "@/lib/hostflow/types";
import type { Mutation } from "@/lib/hostflow/validation";
export interface MutationResult {
  ok: boolean;
  signedIn?: boolean;
  message?: string;
  invitationUrl?: string;
}
export async function mutate(input: Mutation): Promise<MutationResult> {
  const response = await fetch("/api/hostflow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()) as MutationResult & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "Une erreur est survenue.");
  return result;
}
async function requestWorkspace(): Promise<WorkspaceState> {
  const response = await fetch("/api/hostflow", {
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  const data = (await response.json()) as WorkspaceState & { error?: string };
  if (!response.ok) throw new Error(data.error ?? "Connexion interrompue.");
  return data;
}
const WorkspaceContext = createContext<ReturnType<
  typeof useWorkspaceController
> | null>(null);

// One controller per document, owned by the root layout. Route components
// consume it; changing a page must never reset the authenticated workspace.
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspace = useWorkspaceController();
  return createElement(
    WorkspaceContext.Provider,
    { value: workspace },
    children,
  );
}
export function useWorkspace() {
  const workspace = useContext(WorkspaceContext);
  if (!workspace) throw new Error("WorkspaceProvider is required");
  return workspace;
}
export function useWorkspaceController() {
  const [state, setState] = useState<WorkspaceState>(emptyWorkspace);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestNumber = useRef(0);
  const reload = useCallback(() => {
    const current = ++requestNumber.current;
    return requestWorkspace()
      .then((data) => {
        if (current === requestNumber.current) {
          setState(data);
          setError("");
        }
      })
      .catch((e: unknown) => {
        if (current === requestNumber.current) {
          // Keep the last verified workspace during a network failure so a
          // background refresh cannot unmount an unsaved property form.
          // A successful anonymous/revoked-session response still clears it.
          setError(e instanceof Error ? e.message : "Connexion interrompue.");
        }
        throw e;
      })
      .finally(() => {
        if (current === requestNumber.current) setLoading(false);
      });
  }, []);
  useEffect(() => {
    const lifecycle = requestNumber;
    void reload().catch(() => {});
    const refresh = () => {
      if (document.visibilityState === "visible") void reload().catch(() => {});
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 60000);
    return () => {
      ++lifecycle.current;
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [reload]);
  return { state, loading, error, reload };
}
export type Run = (
  input: Mutation,
  message?: string,
) => Promise<MutationResult | null>;
