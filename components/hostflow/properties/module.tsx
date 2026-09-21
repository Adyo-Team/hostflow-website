"use client";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "../shared";
import type { Membership } from "@/lib/hostflow/types";
import { canEditProperties } from "@/lib/properties/types";
import { PropertyList } from "./list";
import { PropertyDetail } from "./detail";
import { PropertyForm } from "./form";
export type PropertiesView = "list" | "detail" | "new" | "edit";
export function PropertiesModule({
  active,
  view = "list",
  id,
  startPhotos = false,
  onDirtyChange,
}: {
  active?: Membership;
  view?: PropertiesView;
  id?: string;
  startPhotos?: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  if (!active || !canEditProperties(active.role))
    return (
      <div className="hf-panel">
        <EmptyState
          icon={ShieldCheck}
          title="Accès au portefeuille restreint"
          description="La gestion des logements est réservée aux owner, administrateurs et managers. Les accès liés aux missions seront disponibles avec le module Opérations."
        />
      </div>
    );
  if (view === "new" || view === "edit")
    return (
      <PropertyForm
        id={view === "edit" ? id : undefined}
        active={active}
        startPhotos={startPhotos}
        onDirtyChange={onDirtyChange}
      />
    );
  if (view === "detail" && id)
    return <PropertyDetail id={id} active={active} />;
  return <PropertyList organizationId={active.organization_id} />;
}
