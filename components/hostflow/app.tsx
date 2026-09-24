"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, CircleHelp, ShieldCheck, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { useWorkspace, mutate } from "./client";
import { initials } from "./shared";
import type { Page } from "@/lib/hostflow/types";
import type { Mutation } from "@/lib/hostflow/validation";
import { useHostFlowTools } from "./webmcp";
import { Navigation } from "./navigation";
import { Dashboard } from "./dashboard";
import { CalendarModule } from "./calendar/module";
import { PropertiesModule, type PropertiesView } from "./properties/module";
import {
  ReservationsModule,
  type ReservationsView,
} from "./reservations/module";
import { ConfirmPropertyAction } from "./properties/shared";
import { Team } from "./team";
import { Settings } from "./settings";
import { Roles } from "./roles";
import { Roadmap } from "./roadmap";
const pageLabels: Record<Page, string> = {
  dashboard: "Vue d’ensemble",
  team: "Équipe",
  settings: "Paramètres",
  roles: "Rôles et accès",
  properties: "Logements",
  reservations: "Réservations",
  calendar: "Calendrier",
};
export function HostFlowApp({
  page,
  propertyView,
  propertyId,
  propertyStartPhotos,
  reservationView,
  reservationId,
}: {
  page: Page;
  propertyView?: PropertiesView;
  propertyId?: string;
  propertyStartPhotos?: boolean;
  reservationView?: ReservationsView;
  reservationId?: string;
}) {
  const { state, loading, error, reload } = useWorkspace();
  const router = useRouter();
  const [roadmap, setRoadmap] = useState(false);
  const [busy, setBusy] = useState(false);
  const [propertyDirty, setPropertyDirty] = useState(false);
  const [pendingOrganization, setPendingOrganization] = useState<string | null>(
    null,
  );
  const active = state.memberships.find(
    (m) => m.organization_id === state.activeOrganizationId,
  );
  const organization = active?.organization;
  useEffect(() => {
    if (!loading && !error && state.configured && !state.user)
      window.location.replace("/login");
    else if (
      !loading &&
      !error &&
      state.user &&
      !state.memberships.length &&
      page !== "settings"
    )
      window.location.replace("/welcome");
  }, [
    loading,
    error,
    state.configured,
    state.user,
    state.memberships.length,
    page,
  ]);
  useHostFlowTools();
  async function run(input: Mutation, message?: string) {
    setBusy(true);
    try {
      const result = await mutate(input);
      await reload();
      if (message) toast.success(message);
      return result;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Une erreur est survenue.");
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function switchOrganization(id: string) {
    const result = await run({
      action: "switchOrganization",
      organizationId: id,
    });
    if (result && page === "properties") {
      setPropertyDirty(false);
      router.replace("/properties");
    }
    if (result && page === "reservations") {
      setPropertyDirty(false);
      router.replace("/reservations");
    }
    setPendingOrganization(null);
  }
  return (
    <SidebarProvider
      style={{ "--sidebar-width": "242px" } as React.CSSProperties}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:bg-white focus:p-4"
      >
        Aller au contenu
      </a>
      <Navigation
        page={page}
        state={state}
        active={active}
        loading={loading}
        onRoadmap={() => setRoadmap(true)}
        onSwitch={(id) => {
          if (id === active?.organization_id) return;
          if (propertyDirty) setPendingOrganization(id);
          else void switchOrganization(id);
        }}
        onLogout={async () => {
          setBusy(true);
          try {
            await mutate({ action: "logout" });
            window.location.href = "/login";
          } catch {
            toast.error("Déconnexion impossible. Réessayez.");
            setBusy(false);
          }
        }}
        busy={busy}
      />
      <SidebarInset className="min-w-0 bg-background">
        <header className="flex h-[76px] items-center justify-between gap-3 border-b bg-white px-5 md:px-9">
          <div className="flex items-center gap-3 text-sm">
            <SidebarTrigger
              aria-label="Ouvrir ou fermer le menu"
              className="md:hidden"
            />
            <span className="hidden text-[#87918f] lg:inline">
              Espace de travail
            </span>
            <ChevronRight className="hidden size-3.5 text-[#a0aaa6] lg:inline" />
            <span className="font-medium">{pageLabels[page]}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hf-tag hidden lg:inline-flex">HostFlow v0.5</span>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Voir les étapes du projet"
              onClick={() => setRoadmap(true)}
            >
              <CircleHelp className="size-[19px] text-[#6e7e7a]" />
            </Button>
            <span className="h-6 w-px bg-border hidden lg:inline" />
            <Link
              prefetch={false}
              href={state.user ? "/settings" : "/login"}
              aria-label={state.user ? "Mon compte" : "Se connecter"}
              className="hf-avatar"
            >
              {active ? (
                initials(active.display_name)
              ) : (
                <UserRound className="size-4" />
              )}
            </Link>
          </div>
        </header>
        <div id="main" className="hf-page">
          {error ? (
            <div
              role="alert"
              className="hf-error mb-6 flex justify-between items-center gap-4"
            >
              <span>{error}</span>
              <Button
                onClick={() => void reload().catch(() => {})}
                variant="outline"
              >
                Réessayer
              </Button>
            </div>
          ) : null}
          {loading ? (
            <div aria-label="Chargement de votre espace" className="grid gap-6">
              <Skeleton className="h-20 w-2/3" />
              <Skeleton className="h-36 w-full" />
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36" />
                ))}
              </div>
            </div>
          ) : (!error || !!state.user) &&
            (!state.configured || state.user) &&
            (!state.configured ||
              page === "settings" ||
              state.memberships.length > 0) ? (
            <>
              {!state.configured && (
                <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-[#586f65] border border-[#dce6df] bg-[#edf4ef] px-4 py-3 rounded-lg">
                  <ShieldCheck className="size-4 shrink-0" />
                  <strong className="font-semibold">
                    Espace non connecté.
                  </strong>
                  <span>
                    La connexion au service doit être finalisée avant de créer
                    un compte.
                  </span>
                </div>
              )}
              {page === "dashboard" && (
                <Dashboard
                  state={state}
                  active={active}
                  roadmap={() => setRoadmap(true)}
                />
              )}
              {page === "team" && (
                <Team
                  key={active?.organization_id}
                  state={state}
                  active={active}
                  run={run}
                  busy={busy}
                />
              )}
              {page === "settings" && (
                <Settings
                  key={active?.organization_id}
                  state={state}
                  active={active}
                  organization={organization}
                  run={run}
                  busy={busy}
                />
              )}
              {page === "roles" && <Roles />}
              {page === "calendar" && <CalendarModule key={active?.organization_id} active={active} />}
              {page === "reservations" && (
                <ReservationsModule
                  key={[
                    active?.organization_id,
                    reservationView,
                    reservationId,
                  ].join(":")}
                  active={active}
                  view={reservationView}
                  id={reservationId}
                  onDirtyChange={setPropertyDirty}
                />
              )}
              {page === "properties" && (
                <PropertiesModule
                  key={[active?.organization_id, propertyView, propertyId].join(
                    ":",
                  )}
                  active={active}
                  view={propertyView}
                  id={propertyId}
                  startPhotos={propertyStartPhotos}
                  onDirtyChange={setPropertyDirty}
                />
              )}
            </>
          ) : null}
        </div>
        <footer className="mt-auto flex justify-between gap-4 px-6 md:px-10 py-5 text-xs text-[#81908b]">
          <span>HostFlow · Tout commence par un espace bien organisé.</span>
          <span className="hidden sm:block">Calendar Core · v0.5</span>
        </footer>
      </SidebarInset>
      <Roadmap open={roadmap} onOpenChange={setRoadmap} />
      <ConfirmPropertyAction
        open={!!pendingOrganization}
        onOpenChange={(open) => {
          if (!open) setPendingOrganization(null);
        }}
        title="Changer d’organisation ?"
        description="Les modifications non enregistrées de ce formulaire seront abandonnées. Les informations déjà enregistrées sont conservées."
        busy={busy}
        onConfirm={() => {
          if (pendingOrganization) void switchOrganization(pendingOrganization);
        }}
      />
      <Toaster position="bottom-right" richColors />
    </SidebarProvider>
  );
}
