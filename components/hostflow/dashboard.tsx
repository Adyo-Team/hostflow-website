"use client";
import Link from "next/link";
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  DoorOpen,
  Euro,
  Home,
  Layers3,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button, PageHeader } from "@/components/hostflow/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "./shared";
import {
  canReadTeam,
  canManageTeam,
  roleLabels,
  type WorkspaceState,
  type Membership,
} from "@/lib/hostflow/types";
export function Dashboard({
  state,
  active,
  roadmap,
}: {
  state: WorkspaceState;
  active?: Membership;
  roadmap: () => void;
}) {
  const now = new Date();
  const date = now.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: active?.organization?.timezone ?? "Europe/Brussels",
  });
  const milestones = [
    {
      name: "Créer votre compte",
      detail: "Votre accès personnel à HostFlow.",
      done: !!state.user,
      href: state.user ? "/settings" : "/signup",
    },
    {
      name: "Configurer votre organisation",
      detail: "Nom, pays, devise et fuseau horaire.",
      done: !!active?.organization?.country,
      href: active ? "/settings" : state.user ? "/onboarding" : "/signup",
    },
    {
      name: "Constituer votre équipe",
      detail: "Invitez vos premiers collaborateurs.",
      done: !!active?.organization?.team_setup_completed_at,
      href: "/team",
    },
  ];
  const count = milestones.filter((s) => s.done).length;
  return (
    <>
      <PageHeader
        eyebrow="Votre espace de pilotage"
        title="Vue d’ensemble"
        description={
          active
            ? "Bonjour " +
              active.display_name.split(" ")[0] +
              ". Voici votre espace de travail."
            : "Bienvenue sur HostFlow. Faisons place à une gestion plus simple."
        }
        actions={
          <div className="hidden lg:flex items-center gap-2 rounded-lg border bg-white px-3.5 py-2.5 text-sm hf-muted">
            <CalendarDays className="size-4" />
            <span className="capitalize">{date}</span>
          </div>
        }
      />
      {active && (
        <div className="flex flex-wrap items-center gap-2 text-sm hf-muted mb-5">
          <Building2 className="size-4" />
          <span className="font-semibold break-all">
            {active.organization?.name}
          </span>
          <span className="hf-tag">{roleLabels[active.role]}</span>
        </div>
      )}
      <div className="hf-banner mb-6">
        <div>
          <div className="text-[#8cdab7] text-[11px] font-semibold tracking-[1.2px] uppercase mb-3">
            Un bon départ
          </div>
          <h2>
            {active
              ? "Votre espace prend forme."
              : "Votre conciergerie commence ici."}
          </h2>
          <p>
            {active
              ? "Réunissez votre équipe et définissez les accès de chacun. Retrouvez maintenant votre portefeuille dans Logements."
              : "Créez votre organisation, réunissez votre équipe et donnez à chacun le bon niveau d’accès."}
          </p>
        </div>
        <Button
          asChild
          className="bg-white text-[#194c3b] hover:bg-[#eaf8ef] rounded-lg h-11 px-5 shrink-0"
        >
          <Link
            prefetch={false}
            href={
              active
                ? canReadTeam(active.role)
                  ? "/team"
                  : "/settings"
                : state.user
                  ? "/onboarding"
                  : "/signup"
            }
          >
            {active
              ? canManageTeam(active.role)
                ? "Gérer mon équipe"
                : canReadTeam(active.role)
                  ? "Voir mon équipe"
                  : "Mon profil"
              : "Configurer mon espace"}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-7">
        {[
          {
            label: "Logements actifs",
            Icon: Building2,
            note:
              state.activePropertyCount === null
                ? "Accès au portefeuille restreint"
                : "Dans votre organisation",
            value: state.activePropertyCount,
          },
          {
            label: "Taux d’occupation",
            Icon: Home,
            note: "Après ajout des réservations",
          },
          {
            label: "Revenus du mois",
            Icon: Euro,
            note: "Le suivi financier sera activé",
          },
          {
            label: "Missions à réaliser",
            Icon: ClipboardList,
            note: "Le suivi des opérations à venir",
          },
        ].map(({ label, Icon, note, value }) => (
          <div className="hf-panel hf-stat" key={label}>
            <div className="hf-stat-title">
              <span>{label}</span>
              <Icon className="size-[17px] text-[#84978b]" />
            </div>
            <div
              className="hf-stat-value"
              aria-label={value == null ? "Indisponible" : undefined}
            >
              {value ?? "—"}
            </div>
            <div className="hf-stat-note">{note}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)] gap-6">
        <div className="space-y-6">
          <section className="hf-panel">
            <div className="hf-panel-header">
              <h2 className="hf-panel-title">Aujourd’hui</h2>
              <span className="hf-tag">Opérations à venir</span>
            </div>
            <Tabs defaultValue="arrivals" className="gap-0">
              <div className="px-5 border-b">
                <TabsList className="bg-transparent h-12 gap-3 w-full justify-start rounded-none p-0 overflow-x-auto overflow-y-hidden">
                  <TabsTrigger value="arrivals" className="hf-operation-tab">
                    <ArrowDownLeft className="size-4" />
                    Arrivées
                  </TabsTrigger>
                  <TabsTrigger value="departures" className="hf-operation-tab">
                    <ArrowUpRight className="size-4" />
                    Départs
                  </TabsTrigger>
                  <TabsTrigger value="cleaning" className="hf-operation-tab">
                    <Sparkles className="size-4" />
                    Ménages
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="arrivals">
                <EmptyState
                  icon={DoorOpen}
                  title="Vos prochaines arrivées, au même endroit"
                  description="Les séjours et les instructions d’accueil apparaîtront ici à l’activation des réservations."
                />
              </TabsContent>
              <TabsContent value="departures">
                <EmptyState
                  icon={ArrowUpRight}
                  title="Une vue claire sur les départs"
                  description="Les départs seront regroupés ici pour préparer la remise en état de chaque logement."
                />
              </TabsContent>
              <TabsContent value="cleaning">
                <EmptyState
                  icon={Sparkles}
                  title="Chaque logement prêt à temps"
                  description="Les missions de ménage et leur avancement apparaîtront ici avec le module Opérations."
                />
              </TabsContent>
            </Tabs>
          </section>
          <section className="hf-panel">
            <div className="hf-panel-header border-b">
              <h2 className="hf-panel-title">Activité récente</h2>
              <Activity className="size-4 text-[#92a098]" />
            </div>
            {state.audit.length ? (
              <div className="px-6 py-1">
                {state.audit.slice(0, 4).map((event) => (
                  <div
                    className="flex items-start gap-3 py-4 border-b last:border-0"
                    key={event.id}
                  >
                    <span className="bg-[#edf6f0] p-2 rounded-full text-[#5b8b6d]">
                      <CheckCheck className="size-3.5" />
                    </span>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {auditLabel(event.entity_type, event.action)}
                      </p>
                      <p className="text-xs text-[#83918a] mt-1">
                        {new Date(event.created_at).toLocaleString("fr-FR", {
                          timeZone: active?.organization?.timezone,
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex gap-4 items-start p-6 py-7">
                <span className="hf-icon-box shrink-0">
                  <Clock3 className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-medium">
                    {active && !canManageTeam(active.role)
                      ? "Un suivi réservé aux administrateurs"
                      : "L’histoire de votre espace commence ici"}
                  </p>
                  <p className="text-sm text-[#7c8b83] mt-1.5 leading-relaxed">
                    Les créations d’organisation et les changements d’accès y
                    seront historisés.
                  </p>
                </div>
              </div>
            )}
          </section>
        </div>
        <div className="space-y-6">
          <section className="hf-panel">
            <div className="hf-panel-header pb-4">
              <h2 className="hf-panel-title">Les premiers pas</h2>
              <span className="text-xs text-[#66816e] font-semibold">
                {count} sur 3
              </span>
            </div>
            <div className="px-6">
              <div
                className="flex gap-1.5 mb-2"
                aria-label={count + " étapes terminées sur 3"}
              >
                {[1, 2, 3].map((i) => (
                  <span
                    key={i}
                    className={
                      "h-1.5 flex-1 rounded-full " +
                      (i <= count ? "bg-[#118058]" : "bg-[#e8efea]")
                    }
                  />
                ))}
              </div>
            </div>
            <div className="px-5 pb-3">
              {milestones.map((step, index) => (
                <Link
                  prefetch={false}
                  href={step.href}
                  key={step.name}
                  className="flex gap-3 py-4 px-1 items-start border-b last:border-0 group"
                >
                  <span
                    className={
                      "size-6 rounded-full shrink-0 grid place-items-center text-[11px] font-semibold mt-0.5 " +
                      (step.done
                        ? "bg-[#e6f4eb] text-[#158659]"
                        : "border border-[#d9e4dd] text-[#829488]")
                    }
                  >
                    {step.done ? <Check className="size-3.5" /> : index + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block text-sm font-semibold group-hover:text-primary">
                      {step.name}
                    </span>
                    <span className="block text-[13px] text-[#819086] mt-1 leading-relaxed">
                      {step.detail}
                    </span>
                  </span>
                  <ChevronRight className="size-3.5 text-[#a1ada6] mt-1.5" />
                </Link>
              ))}
            </div>
          </section>
          {active && canReadTeam(active.role) && (
            <section className="hf-panel">
              <div className="hf-panel-header border-b">
                <h2 className="hf-panel-title">Votre équipe</h2>
                <span className="hf-tag">
                  {state.members.filter((m) => m.status === "active").length}{" "}
                  actifs
                </span>
              </div>
              <div className="px-6 py-2">
                {state.members
                  .filter((m) => m.status === "active")
                  .slice(0, 4)
                  .map((member) => (
                    <div
                      key={member.id}
                      className="py-3 border-b last:border-0"
                    >
                      <p className="text-sm font-medium break-words">
                        {member.display_name}
                      </p>
                      <p className="text-xs hf-muted mt-1">
                        {roleLabels[member.role]}
                      </p>
                    </div>
                  ))}
              </div>
              <Link
                prefetch={false}
                href="/team"
                className="hf-link block px-6 pb-5"
              >
                Voir toute l’équipe
              </Link>
            </section>
          )}
          <section className="rounded-xl bg-[#edf4ef] p-6 border border-[#dfe9e1]">
            <div className="flex gap-3 items-center mb-3">
              <ShieldCheck className="size-5 text-[#48765b]" />
              <h2 className="font-semibold text-[15px] text-[#34533e]">
                À chacun son espace
              </h2>
            </div>
            <p className="text-sm leading-relaxed text-[#6d8170]">
              Owner, administrateur, manager et équipe disposent de leurs
              propres niveaux d’accès. Les portails propriétaires et voyageurs
              viendront plus tard.
            </p>
            <Link
              prefetch={false}
              href="/roles"
              className="text-[13px] font-semibold mt-5 flex items-center gap-2 text-[#3a704b]"
            >
              Comprendre les rôles
              <ArrowRight className="size-3.5" />
            </Link>
          </section>
          <button
            onClick={roadmap}
            className="text-[13px] text-[#718677] flex items-center gap-2 pl-1 hover:text-primary"
          >
            <Layers3 className="size-4" />
            Découvrir les prochaines étapes
            <ArrowUpRight className="size-3.5" />
          </button>
        </div>
      </div>
    </>
  );
}
function auditLabel(entity: string, action: string) {
  const label: Record<string, string> = {
    organizations: "Organisation",
    properties: "Logement",
    reservations: "Réservation",
    property_blocks: "Blocage de logement",
    property_images: "Photo de logement",
    organization_memberships: "Membre de l’équipe",
    organization_members: "Membre de l’équipe",
    organization_invitations: "Invitation",
  };
  return (
    (label[entity] ?? "Élément") +
    (action === "insert"
      ? " ajouté(e)"
      : action === "delete"
        ? " retiré(e)"
        : " mis(e) à jour")
  );
}
