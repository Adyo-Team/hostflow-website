"use client";
import { useEffect } from "react";
import type { WorkspaceState } from "@/lib/hostflow/types";
type Tool = {
  name: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => Promise<unknown>;
};
export function useHostFlowTools() {
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: "read_hostflow_access",
            description:
              "Read the signed-in user’s current organization and role. Does not return team, guest or financial data.",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false,
            },
            annotations: { readOnlyHint: true, untrustedContentHint: true },
            execute: async (input) => {
              if (
                !input ||
                typeof input !== "object" ||
                Array.isArray(input) ||
                Object.keys(input).length
              )
                throw new Error("Expected an empty object.");
              const response = await fetch("/api/hostflow", {
                cache: "no-store",
              });
              if (!response.ok) throw new Error("Session unavailable.");
              const data = (await response.json()) as WorkspaceState;
              const active = data.memberships.find(
                (m: { organization_id: string }) =>
                  m.organization_id === data.activeOrganizationId,
              );
              return {
                configured: data.configured,
                signedIn: !!data.user,
                organization: active?.organization?.name ?? null,
                role: active?.role ?? null,
              };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional browser capability; UI remains available. */
    }
    return () => lifecycle.abort();
  }, []);
}
