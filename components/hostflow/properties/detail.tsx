"use client";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Pencil,
  Archive,
  RotateCcw,
  Users,
  BedDouble,
  Bath,
  MapPin,
  LockKeyhole,
  Eye,
  EyeOff,
  Layers3,
} from "lucide-react";
import { Button } from "@/components/hostflow/ui";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState, countryItems } from "../shared";
import {
  typeLabels,
  canArchiveProperties,
  type PropertyDetail as DetailData,
} from "@/lib/properties/types";
import type { Membership } from "@/lib/hostflow/types";
import { propertyRequest, usePropertyResource } from "./client";
import { useWorkspace } from "../client";
import {
  PropertyLoading,
  PropertyFailure,
  PropertyPhoto,
  PropertyStatusBadge,
  ConfirmPropertyAction,
} from "./shared";
import { PropertyPhotos } from "./photos";
import { LinkedTasks } from "../tasks/module";
import { PropertyStays } from "../reservations/module";
function Value({
  label,
  value,
}: {
  label: string;
  value: string | number | null | undefined;
}) {
  return (
    <div className="py-3 border-b last:border-0 min-w-0">
      <dt className="text-sm hf-muted mb-1.5">{label}</dt>
      <dd className="text-sm whitespace-pre-wrap break-words">
        {value ?? "Non renseigné"}
      </dd>
    </div>
  );
}
export function PropertyDetail({
  id,
  active,
}: {
  id: string;
  active: Membership;
}) {
  const { reload: reloadWorkspace } = useWorkspace();
  const { data, error, loading, reload, refreshing } =
    usePropertyResource<DetailData>("/" + id, active.organization_id);
  const [showPassword, setShowPassword] = useState(false);
  const [confirmation, setConfirmation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  if (loading && !data) return <PropertyLoading variant="detail" />;
  if (error) return <PropertyFailure error={error} retry={reload} />;
  if (!data) return null;
  const p = data.property;
  const cover = data.images.find((i) => i.is_cover && i.state === "ready");
  const archived = p.status === "archived";
  const allowedArchive = canArchiveProperties(active.role);
  const money = (value: number | null) =>
    value === null
      ? null
      : new Intl.NumberFormat("fr-FR", {
          style: "currency",
          currency: active.organization?.currency ?? "EUR",
        }).format(value);
  async function archive() {
    if (!data || busy) return;
    setBusy(true);
    setFailure("");
    try {
      await propertyRequest("/" + id, active.organization_id, {
        method: "PATCH",
        body: { archived: !archived, version: data.property.version },
      });
      setConfirmation(false);
      reload();
      void reloadWorkspace().catch(() => {});
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Modification impossible.");
      setConfirmation(false);
    } finally {
      setBusy(false);
    }
  }
  const future = [
    ["reservations", "Réservations"],
    ["calendar", "Calendrier"],
    ["operations", "Opérations"],
    ["finance", "Finance"],
    ["documents", "Documents"],
    ["settings", "Paramètres"],
  ];
  return (
    <>
      <Link
        prefetch={false}
        href="/properties"
        className="hf-link inline-flex items-center gap-2 mb-5"
      >
        <ArrowLeft className="size-4" />
        Tous les logements
      </Link>
      {failure && (
        <p role="alert" className="hf-error mb-5">
          {failure}
        </p>
      )}
      <header className="hf-panel overflow-hidden mb-6">
        <div className="relative h-56 md:h-72">
          <PropertyPhoto
            org={active.organization_id}
            id={id}
            imageId={cover?.id ?? null}
            alt={p.name}
            priority
          />
        </div>
        <div className="p-5 md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap gap-3 items-center mb-3">
                <span className="hf-overline">
                  {typeLabels[p.property_type]}
                </span>
                <PropertyStatusBadge status={p.status} />
              </div>
              <h1 className="hf-heading break-words">{p.name}</h1>
              <p className="text-sm hf-muted mt-3 flex gap-2 items-start">
                <MapPin className="size-4 shrink-0 mt-0.5" />
                {[
                  p.address_line1,
                  p.postal_code,
                  p.city,
                  countryItems.find(([v]) => v === p.country)?.[1] ?? p.country,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {!archived && (
                <Button asChild>
                  <Link prefetch={false} href={"/properties/" + id + "/edit"}>
                    <Pencil className="size-4" />
                    Modifier
                  </Link>
                </Button>
              )}
              {allowedArchive && (
                <Button
                  variant="outline"
                  disabled={busy || refreshing}
                  onClick={() => setConfirmation(true)}
                >
                  {archived ? (
                    <RotateCcw className="size-4" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                  {archived ? "Restaurer" : "Archiver"}
                </Button>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3 mt-6 text-sm">
            <span className="flex gap-2 items-center">
              <Users className="size-4 hf-muted" />
              {p.capacity} personnes
            </span>
            <span className="flex gap-2 items-center">
              <BedDouble className="size-4 hf-muted" />
              {p.bedrooms} chambres · {p.beds} lits
            </span>
            <span className="flex gap-2 items-center">
              <Bath className="size-4 hf-muted" />
              {p.bathrooms} salles de bain
            </span>
          </div>
        </div>
      </header>
      {archived && (
        <p className="rounded-lg border bg-[#f1f3f2] p-4 text-sm hf-muted mb-6">
          Ce logement est archivé. Ses informations et ses photos sont
          conservées. Un owner ou un administrateur peut le restaurer.
        </p>
      )}
      <Tabs defaultValue="overview" className="gap-6">
        <div className="overflow-x-auto overflow-y-hidden border-b">
          <TabsList variant="line" className="h-12 min-w-max gap-4">
            <TabsTrigger value="overview" className="px-3">
              Vue d’ensemble
            </TabsTrigger>
            {future.map(([key, label]) => (
              <TabsTrigger key={key} value={key} className="px-3">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="hf-panel p-5 md:p-7">
              <h2 className="hf-panel-title mb-3">Informations générales</h2>
              <dl>
                <Value label="Nom interne" value={p.internal_name} />
                <Value
                  label="Type de logement"
                  value={typeLabels[p.property_type]}
                />
                <Value
                  label="Propriétaire"
                  value="Non attribué — disponible avec le module Propriétaires"
                />
                <Value
                  label="Adresse"
                  value={[
                    p.address_line1,
                    p.address_line2,
                    p.postal_code,
                    p.city,
                    p.country,
                  ]
                    .filter(Boolean)
                    .join("\n")}
                />
                {p.latitude !== null && (
                  <Value
                    label="Coordonnées"
                    value={p.latitude + ", " + p.longitude}
                  />
                )}
              </dl>
            </section>
            <section className="hf-panel p-5 md:p-7">
              <h2 className="hf-panel-title mb-3">Exploitation</h2>
              <dl>
                <Value
                  label="Heure d’arrivée"
                  value={p.check_in_time.slice(0, 5)}
                />
                <Value
                  label="Heure de départ"
                  value={p.check_out_time.slice(0, 5)}
                />
                <Value label="Frais de ménage" value={money(p.cleaning_fee)} />
                <Value
                  label="Commission de gestion"
                  value={
                    p.management_commission_percent === null
                      ? null
                      : p.management_commission_percent + " %"
                  }
                />
              </dl>
              <p className="text-xs hf-muted mt-4">
                Ces paramètres seront utilisés par les futurs modules de
                réservation et de gestion.
              </p>
            </section>
          </div>
          <section className="hf-panel p-5 md:p-7">
            <h2 className="hf-panel-title mb-5">Équipements</h2>
            {data.amenities.length ? (
              <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {data.catalog
                  .filter((a) => data.amenities.includes(a.id))
                  .map((a) => (
                    <li
                      key={a.id}
                      className="rounded-lg border px-4 py-3 text-sm"
                    >
                      {a.name}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-sm hf-muted">Aucun équipement renseigné.</p>
            )}
          </section>
          <section className="hf-panel p-5 md:p-7">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <LockKeyhole className="size-5 text-primary" />
              <h2 className="hf-panel-title">Accès et informations privées</h2>
              <span className="hf-tag">Accès restreint</span>
            </div>
            <div className="grid lg:grid-cols-2 gap-x-8">
              <dl>
                <Value label="Réseau Wi-Fi" value={p.wifi_name} />
                <div className="py-3 border-b">
                  <dt className="text-sm hf-muted mb-1.5">
                    Mot de passe Wi-Fi
                  </dt>
                  <dd className="flex items-center justify-between gap-4 text-sm break-all">
                    <span>
                      {p.wifi_password
                        ? showPassword
                          ? p.wifi_password
                          : "••••••••"
                        : "Non renseigné"}
                    </span>
                    {p.wifi_password && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={
                          showPassword
                            ? "Masquer le mot de passe Wi-Fi"
                            : "Afficher le mot de passe Wi-Fi"
                        }
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        {showPassword ? <EyeOff /> : <Eye />}
                      </Button>
                    )}
                  </dd>
                </div>
                <Value
                  label="Instructions d’accès"
                  value={p.access_instructions}
                />
              </dl>
              <dl>
                <Value
                  label="Instructions de ménage"
                  value={p.cleaning_instructions}
                />
                <Value label="Notes privées" value={p.private_notes} />
              </dl>
            </div>
          </section>
          <section className="hf-panel p-5 md:p-7">
            <PropertyPhotos
              organizationId={active.organization_id}
              propertyId={id}
            />
            {!archived && (
              <Link
                prefetch={false}
                href={"/properties/" + id + "/edit?step=photos"}
                className="hf-link inline-flex items-center gap-2 mt-5"
              >
                Gérer les photos
                <ArrowRight className="size-4" />
              </Link>
            )}
          </section>
          <p className="text-xs hf-muted">
            Dernière modification :{" "}
            {new Date(p.updated_at).toLocaleString("fr-FR", {
              timeZone: active.organization?.timezone ?? "Europe/Brussels",
            })}
          </p>
        </TabsContent>
        {future.map(([key, label]) => (
          <TabsContent key={key} value={key}>
            {key === "reservations" ? (
              <PropertyStays org={active.organization_id} propertyId={id} />
            ) : key === "operations" ? (
              <LinkedTasks active={active} propertyId={id} />
            ) : (
              <section className="hf-panel">
                <EmptyState
                  icon={Layers3}
                  title={label}
                  description="Disponible dans une prochaine version."
                />
              </section>
            )}
          </TabsContent>
        ))}
      </Tabs>
      <ConfirmPropertyAction
        open={confirmation}
        onOpenChange={setConfirmation}
        title={archived ? "Restaurer ce logement ?" : "Archiver ce logement ?"}
        description={
          archived
            ? "Le logement redeviendra inactif. Vous pourrez ensuite le modifier et le réactiver."
            : "Il quittera la liste des logements actifs. Ses informations, ses équipements et ses photos seront conservés."
        }
        busy={busy}
        onConfirm={() => void archive()}
      />
    </>
  );
}
