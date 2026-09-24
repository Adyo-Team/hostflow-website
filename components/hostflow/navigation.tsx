"use client";
import Link from "next/link";
import { canEditProperties } from "@/lib/properties/types";
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardList,
  Layers3,
  Link2,
  LogOut,
  Mail,
  Plus,
  Settings2,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  WandSparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/hostflow/ui";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Brand, initials } from "./shared";
import {
  roleLabels,
  canReadTeam,
  type Page,
  type WorkspaceState,
  type Membership,
} from "@/lib/hostflow/types";
const upcoming: [string, LucideIcon][] = [
  ["Propriétaires", UserRound],
];
export function Navigation({
  page,
  state,
  active,
  loading,
  onRoadmap,
  onSwitch,
  onLogout,
  busy,
}: {
  page: Page;
  state: WorkspaceState;
  active?: Membership;
  loading: boolean;
  onRoadmap: () => void;
  onSwitch: (id: string) => void;
  onLogout: () => void;
  busy: boolean;
}) {
  const { setOpenMobile } = useSidebar();
  const link = (
    label: string,
    Icon: LucideIcon,
    href: string,
    key: string,
    disabled = false,
  ) => (
    <SidebarMenuItem key={key}>
      <SidebarMenuButton
        asChild={!disabled}
        disabled={disabled}
        isActive={page === key}
        className="hf-nav-button"
      >
        {disabled ? (
          <>
            <Icon />
            <span>{label}</span>
          </>
        ) : (
          <Link
            prefetch={false}
            href={href}
            aria-current={page === key ? "page" : undefined}
            onClick={() => setOpenMobile(false)}
          >
            <Icon />
            <span>{label}</span>
          </Link>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  const future = (label: string, Icon: LucideIcon) => (
    <SidebarMenuItem key={label}>
      <SidebarMenuButton
        onClick={onRoadmap}
        className="hf-nav-button text-[#87938f]"
        aria-label={label + " — module à venir"}
      >
        <Icon />
        <span>{label}</span>
        <small className="hf-upcoming">À venir</small>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
  return (
    <Sidebar className="border-r" collapsible="offcanvas">
      <SidebarHeader className="px-6 pt-8 pb-5">
        <Brand />
      </SidebarHeader>
      <div className="px-4 mb-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              disabled={busy || loading}
              variant="outline"
              className="w-full h-[63px] justify-start rounded-lg shadow-none px-3 bg-[#fafcfb]"
            >
              <span className="flex items-center justify-center size-8 rounded-md bg-[#e8eeea] text-[#5b7265]">
                <Building2 className="size-4" />
              </span>
              <span className="min-w-0 text-left flex-1">
                <span className="block text-[13px] font-semibold truncate max-w-[132px]">
                  {loading
                    ? "Chargement de votre espace…"
                    : (active?.organization?.name ?? "Votre conciergerie")}
                </span>
                <span className="block text-[11px] text-[#849087] mt-1 font-normal">
                  {loading
                    ? "Vérification de vos accès"
                    : active
                      ? "Espace de travail"
                      : "Aucun espace créé"}
                </span>
              </span>
              <ChevronDown className="size-3 text-[#75877d]" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuLabel>Vos organisations</DropdownMenuLabel>
            {state.memberships.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => onSwitch(m.organization_id)}
              >
                <Building2 className="size-4" />
                <span className="flex-1 truncate">{m.organization?.name}</span>
                {m.organization_id === state.activeOrganizationId && (
                  <Check className="size-4" />
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                prefetch={false}
                href={state.user ? "/onboarding" : "/signup"}
              >
                <Plus className="size-4" />
                Créer une organisation
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <SidebarContent className="hf-sidebar-scroll px-3 gap-0">
        <div className="hf-nav-label">Pilotage</div>
        <SidebarMenu className="gap-1">
          {link("Vue d’ensemble", Layers3, "/", "dashboard")}
          {link(
            "Logements",
            Building2,
            "/properties",
            "properties",
            !active || !canEditProperties(active.role),
          )}
          {link(
            "Réservations",
            CalendarDays,
            "/reservations",
            "reservations",
            !active || !canEditProperties(active.role),
          )}
          {upcoming.map(([label, Icon]) => future(label, Icon))}
          {link("Calendrier", CalendarDays, "/calendar", "calendar", !active || !canEditProperties(active.role))}
        </SidebarMenu>
        <div className="hf-nav-label">Opérations</div>
        <SidebarMenu className="gap-1">
          {future("Missions", ClipboardList)}
          {future("Ménages", Sparkles)}
          {future("Maintenance", Wrench)}
          {link(
            "Équipe",
            Users,
            "/team",
            "team",
            loading || (!!active && !canReadTeam(active.role)),
          )}
        </SidebarMenu>
        <div className="hf-nav-label">Gestion</div>
        <SidebarMenu className="gap-1">
          {future("Finances", TrendingUp)}
          {future("Messages", Mail)}
          {future("Automatisations", WandSparkles)}
          {future("Canaux", Link2)}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-3 border-t gap-1 mt-3">
        <SidebarMenu>
          {link("Rôles et accès", ShieldCheck, "/roles", "roles")}
          {link("Paramètres", Settings2, "/settings", "settings")}
        </SidebarMenu>
        <div className="flex items-center gap-3 px-3 pt-3 pb-2 border-t mt-2">
          <span className="hf-avatar">
            {active ? (
              initials(active.display_name)
            ) : (
              <UserRound className="size-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold truncate">
              {loading
                ? "Chargement…"
                : (active?.display_name ?? "Votre compte")}
            </div>
            <div className="text-[11px] text-[#839089] mt-1 min-h-4 truncate">
              {loading
                ? ""
                : active
                  ? roleLabels[active.role]
                  : "Bienvenue sur HostFlow"}
            </div>
          </div>
          {state.user ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Se déconnecter"
              disabled={busy}
              onClick={onLogout}
            >
              <LogOut className="size-4" />
            </Button>
          ) : !loading ? (
            <Link prefetch={false} href="/login" aria-label="Se connecter">
              <ArrowRight className="size-4 text-[#789184]" />
            </Link>
          ) : null}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
