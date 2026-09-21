"use client";
import { ArrowRight, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "./shared";
import type { WorkspaceState, Membership } from "@/lib/hostflow/types";
export function AccessGate({
  state,
  active,
  children,
}: {
  state: WorkspaceState;
  active?: Membership;
  children: React.ReactNode;
}) {
  if (!active)
    return (
      <div className="hf-panel">
        <EmptyState
          icon={Building2}
          title="Un espace pour votre organisation"
          description={
            state.user
              ? "Créez votre organisation pour retrouver votre équipe et vos paramètres."
              : "Connectez-vous ou créez un compte pour accéder à votre organisation."
          }
        >
          <Button asChild>
            <a href={state.user ? "/onboarding" : "/signup"}>
              {state.user ? "Créer mon organisation" : "Créer mon compte"}
              <ArrowRight />
            </a>
          </Button>
        </EmptyState>
      </div>
    );
  return children;
}
