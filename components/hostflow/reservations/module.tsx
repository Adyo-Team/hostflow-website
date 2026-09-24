"use client";
import { LinkedTasks } from "../tasks/module";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { validDate } from "@/lib/calendar/dates.mjs";
import { Plus, ArrowLeft, CalendarDays, ShieldCheck } from "lucide-react";
import {
  PageHeader,
  PageLoading,
  StatusBadge,
  Pager,
  FilterBar,
  Button,
} from "@/components/hostflow/ui";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Field, Choice, EmptyState } from "../shared";
import { ConfirmPropertyAction } from "../properties/shared";
import type { Membership } from "@/lib/hostflow/types";
import {
  canManageReservations,
  reservationStatuses,
  blockReasons,
  type Reservation,
  type ReservationList,
  type ReservationDetail,
  type PropertyBlock,
  type PropertyOption,
  type BlockList,
} from "@/lib/reservations/types";
import { reservationInput, blockInput } from "@/lib/reservations/validation";
import { stayRequest, useStayResource } from "./client";
import { propertyId as createId } from "@/lib/properties/id";
export type ReservationsView = "list" | "new" | "detail" | "edit";
const dateLabel = (v: string) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(v + "T12:00:00Z"));
function Failure({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="alert" className="hf-error flex flex-wrap gap-4 justify-between">
      <span>{error}</span>
      <Button variant="outline" onClick={retry}>
        Réessayer
      </Button>
    </div>
  );
}
function Loading({
  variant = "list",
  header = true,
}: {
  variant?: "list" | "detail" | "form";
  header?: boolean;
}) {
  return (
    <PageLoading
      label="Chargement des réservations"
      variant={variant}
      header={header}
    />
  );
}
function Status({ status }: { status: Reservation["status"] }) {
  return (
    <StatusBadge tone={status === "confirmed" ? "success" : "neutral"}>
      {reservationStatuses[status]}
    </StatusBadge>
  );
}
export function ReservationsModule({
  active,
  view = "list",
  id,
  onDirtyChange,
}: {
  active?: Membership;
  view?: ReservationsView;
  id?: string;
  onDirtyChange: (v: boolean) => void;
}) {
  if (!active || !canManageReservations(active.role))
    return (
      <section className="hf-panel">
        <EmptyState
          icon={ShieldCheck}
          title="Accès aux réservations restreint"
          description="La gestion des réservations est réservée aux propriétaires de l’organisation, administrateurs et managers."
        />
      </section>
    );
  if (view === "new")
    return <ReservationForm active={active} onDirtyChange={onDirtyChange} />;
  if (id && (view === "detail" || view === "edit"))
    return (
      <ReservationPage
        active={active}
        id={id}
        edit={view === "edit"}
        onDirtyChange={onDirtyChange}
      />
    );
  return (
    <>
      <PageHeader
        eyebrow="Vos séjours"
        title="Réservations"
        actions={
          <Button asChild>
            <Link prefetch={false} href="/reservations/new">
              <Plus />
              Nouvelle réservation
            </Link>
          </Button>
        }
      />
      <Tabs defaultValue="reservations">
        <TabsList>
          <TabsTrigger value="reservations">Réservations</TabsTrigger>
          <TabsTrigger value="blocks">Blocages</TabsTrigger>
        </TabsList>
        <TabsContent value="reservations">
          <ReservationRows org={active.organization_id} />
        </TabsContent>
        <TabsContent value="blocks">
          <Blocks org={active.organization_id} />
        </TabsContent>
      </Tabs>
    </>
  );
}
function ReservationRows({
  org,
  propertyId,
}: {
  org: string;
  propertyId?: string;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [period, setPeriod] = useState("all");
  const [property, setProperty] = useState("all");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(query);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);
  const options = useStayResource<{ properties: PropertyOption[] }>(
    "/options",
    org,
  );
  const params = new URLSearchParams({
    q: search,
    status,
    period,
    page: String(page),
  });
  if (propertyId || property !== "all")
    params.set("property_id", propertyId || property);
  const { data, error, loading, reload } = useStayResource<ReservationList>(
    "?" + params,
    org,
  );
  return (
    <section className="hf-panel mt-5 overflow-hidden">
      <FilterBar className="sm:grid-cols-2 xl:grid-cols-4">
        <Field
          label="Rechercher un voyageur"
          id="reservation-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Nom du voyageur…"
        />
        <Choice
          label="Statut"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          items={[
            ["all", "Tous les statuts"],
            ...Object.entries(reservationStatuses),
          ]}
        />
        <Choice
          label="Période"
          value={period}
          onChange={(v) => {
            setPeriod(v);
            setPage(1);
          }}
          items={[
            ["all", "Toutes les dates"],
            ["upcoming", "En cours et à venir"],
            ["past", "Passées"],
          ]}
        />
        {!propertyId && (
          <Choice
            label="Logement"
            value={property}
            onChange={(v) => {
              setProperty(v);
              setPage(1);
            }}
            items={[
              ["all", "Tous les logements"],
              ...(options.data?.properties.map(
                (p) => [p.id, p.name] as [string, string],
              ) || []),
            ]}
          />
        )}
      </FilterBar>
      {error ? (
        <div className="p-5">
          <Failure error={error} retry={reload} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <Loading header={false} />
        </div>
      ) : data?.items.length ? (
        <div>
          <div className="hidden border-b bg-white px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#7a8984] md:grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,1fr)_auto] md:gap-5">
            <span>Voyageur</span>
            <span>Logement</span>
            <span>Séjour</span>
            <span className="text-right">Statut</span>
          </div>
          <div className="divide-y">
            {data.items.map((r) => (
              <Link
                prefetch={false}
                key={r.id}
                href={"/reservations/" + r.id}
                className="grid min-w-0 gap-3 px-4 py-4 transition-colors hover:bg-[#f5f8f6] sm:px-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(220px,1fr)_auto] md:items-center md:gap-5"
              >
                <p className="min-w-0 font-semibold break-words">
                  {r.guest_name}
                </p>
                <div className="min-w-0">
                  <p className="truncate">
                    {data.properties.find((p) => p.id === r.property_id)
                      ?.name || "Logement"}
                  </p>
                  <p className="mt-1 text-sm hf-muted">
                    {r.guests_count} voyageur{r.guests_count > 1 ? "s" : ""}
                  </p>
                </div>
                <div className="min-w-0">
                  <p>
                    {dateLabel(r.check_in)} → {dateLabel(r.check_out)}
                  </p>
                  <p className="mt-1 text-sm hf-muted">
                    Source : {r.source === "manual" ? "Manuelle" : r.source}
                  </p>
                </div>
                <span className="justify-self-start md:justify-self-end">
                  <Status status={r.status} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={CalendarDays}
          title="Aucune réservation"
          description="Aucun séjour ne correspond à ces critères."
          compact
        />
      )}
      {data && (
        <Pager page={page} total={data.total} setPage={setPage} embedded />
      )}
    </section>
  );
}
function ReservationPage({
  active,
  id,
  edit,
  onDirtyChange,
}: {
  active: Membership;
  id: string;
  edit: boolean;
  onDirtyChange: (v: boolean) => void;
}) {
  const { data, error, loading, reload } = useStayResource<ReservationDetail>(
    "/" + id,
    active.organization_id,
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  if (error) return <Failure error={error} retry={reload} />;
  if (loading || !data) return <Loading variant={edit ? "form" : "detail"} />;
  if (edit)
    return (
      <ReservationForm
        key={data.reservation.id + ":" + data.reservation.version}
        active={active}
        initial={data.reservation}
        initialProperty={data.property}
        onDirtyChange={onDirtyChange}
      />
    );
  const r = data.reservation;
  async function cancel() {
    setBusy(true);
    setFailure("");
    try {
      const { organization_id, created_at, updated_at, created_by, ...input } =
        r;
      void organization_id;
      void created_at;
      void updated_at;
      void created_by;
      await stayRequest("/" + r.id, active.organization_id, {
        method: "PUT",
        body: { ...input, status: "cancelled" },
      });
      toast.success("Réservation annulée, disponibilité libérée.");
      setConfirm(false);
      reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Annulation impossible.");
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Link
        className="hf-link inline-flex gap-2 mb-5"
        href="/reservations"
        prefetch={false}
      >
        <ArrowLeft />
        Toutes les réservations
      </Link>
      <PageHeader
        eyebrow="Réservation"
        title={r.guest_name}
        description={
          <Link
            href={"/properties/" + r.property_id}
            prefetch={false}
            className="hf-link"
          >
            {data.property.name}
          </Link>
        }
        actions={
          <div className="flex items-center flex-wrap gap-3">
            <Status status={r.status} />
            <Button asChild variant="outline">
              <Link href={"/reservations/" + id + "/edit"} prefetch={false}>
                Modifier
              </Link>
            </Button>
            {r.status !== "cancelled" && (
              <Button variant="outline" onClick={() => setConfirm(true)}>
                Annuler la réservation
              </Button>
            )}
          </div>
        }
      />
      {failure && (
        <p role="alert" className="hf-error mb-5">
          {failure}
        </p>
      )}
      <section className="hf-panel p-5 sm:p-6">
        <dl className="grid sm:grid-cols-2 gap-6">
          {[
            ["Arrivée", dateLabel(r.check_in)],
            ["Départ", dateLabel(r.check_out)],
            ["Voyageurs", r.guests_count],
            ["Source", r.source === "manual" ? "Manuelle" : r.source],
            ["Email", r.guest_email || "Non renseigné"],
            ["Téléphone", r.guest_phone || "Non renseigné"],
            ["Notes internes", r.internal_notes || "Aucune"],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm hf-muted mb-2">{label}</dt>
              <dd className="whitespace-pre-wrap break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <LinkedTasks
        active={active}
        propertyId={r.property_id}
        reservationId={r.id}
      />
      <ConfirmPropertyAction
        open={confirm}
        onOpenChange={setConfirm}
        title="Annuler cette réservation ?"
        description="La réservation reste dans l’historique et ne bloque plus le logement. Aucun message n’est envoyé au voyageur."
        busy={busy}
        onConfirm={() => void cancel()}
      />
    </>
  );
}
function ReservationForm({
  active,
  initial,
  initialProperty,
  onDirtyChange,
}: {
  active: Membership;
  initial?: Reservation;
  initialProperty?: PropertyOption;
  onDirtyChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const { data, error, loading, reload } = useStayResource<{
    properties: PropertyOption[];
  }>("/options", active.organization_id);
  const [id] = useState(() => initial?.id || createId());
  const calendarParams = useSearchParams();
  const calendarProperty = calendarParams.get("property_id") || "";
  const calendarArrival = calendarParams.get("check_in") || "";
  const calendarDeparture = calendarParams.get("check_out") || "";
  const [property, setProperty] = useState(
    initial?.property_id ||
      (/^[0-9a-f-]{36}$/i.test(calendarProperty) ? calendarProperty : ""),
  );
  const [arrival, setArrival] = useState(
    initial?.check_in || (validDate(calendarArrival) ? calendarArrival : ""),
  );
  const [departure, setDeparture] = useState(
    initial?.check_out ||
      (validDate(calendarDeparture) && calendarDeparture > calendarArrival
        ? calendarDeparture
        : ""),
  );
  const [name, setName] = useState(initial?.guest_name || "");
  const [email, setEmail] = useState(initial?.guest_email || "");
  const [phone, setPhone] = useState(initial?.guest_phone || "");
  const [count, setCount] = useState(initial?.guests_count || 1);
  const [notes, setNotes] = useState(initial?.internal_notes || "");
  const [status, setStatus] = useState<Reservation["status"]>(
    initial?.status || "confirmed",
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const properties = [...(data?.properties || [])];
  if (initialProperty && !properties.some((p) => p.id === initialProperty.id))
    properties.push(initialProperty);
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setFailure("");
    const parsed = reservationInput.safeParse({
      id,
      property_id: property,
      check_in: arrival,
      check_out: departure,
      guest_name: name,
      guest_email: email,
      guest_phone: phone,
      guests_count: count,
      internal_notes: notes,
      status,
      source: "manual",
      version: initial?.version || null,
    });
    if (!parsed.success) {
      setFailure(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await stayRequest(initial ? "/" + id : "", active.organization_id, {
        method: initial ? "PUT" : "POST",
        body: parsed.data,
      });
      setDirty(false);
      onDirtyChange(false);
      toast.success("Réservation enregistrée.");
      router.push("/reservations/" + id);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  if (error) return <Failure error={error} retry={reload} />;
  if (loading) return <Loading variant="form" />;
  return (
    <>
      <Link
        prefetch={false}
        href={initial ? "/reservations/" + id : "/reservations"}
        className="hf-link inline-flex gap-2 mb-5"
      >
        <ArrowLeft />
        Retour
      </Link>
      <PageHeader
        eyebrow="Vos séjours"
        title={initial ? "Modifier la réservation" : "Nouvelle réservation"}
      />
      <form
        className="hf-panel hf-form-panel overflow-hidden"
        onSubmit={save}
        onChange={() => setDirty(true)}
      >
        <fieldset disabled={busy} className="space-y-6 p-5 sm:p-6">
          <div className="grid sm:grid-cols-2 gap-5">
            <Choice
              label="Logement"
              value={property}
              onChange={(v) => {
                setProperty(v);
                setDirty(true);
              }}
              items={properties.map((p) => [
                p.id,
                p.name + (p.status !== "active" ? " (inactif)" : ""),
              ])}
            />
            <Choice
              label="Statut"
              value={status}
              onChange={(v) => {
                setStatus(v as Reservation["status"]);
                setDirty(true);
              }}
              items={Object.entries(reservationStatuses)}
            />
            <Field
              label="Date d’arrivée"
              id="check-in"
              type="date"
              required
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
            />
            <Field
              label="Date de départ"
              id="check-out"
              type="date"
              required
              value={departure}
              min={arrival}
              onChange={(e) => setDeparture(e.target.value)}
            />
            <Field
              label="Nom du voyageur"
              id="guest-name"
              required
              maxLength={150}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Field
              label="Nombre de voyageurs"
              id="guests-count"
              type="number"
              required
              min={1}
              max={properties.find((p) => p.id === property)?.capacity || 1000}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
            <Field
              label="Email (facultatif)"
              id="guest-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Field
              label="Téléphone (facultatif)"
              id="guest-phone"
              type="tel"
              maxLength={50}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <div className="hf-field">
            <Label htmlFor="reservation-notes">
              Notes internes (facultatives)
            </Label>
            <Textarea
              id="reservation-notes"
              maxLength={5000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <p className="text-sm hf-muted">
            Source : Manuelle. La date de départ est libre pour une nouvelle
            arrivée. La disponibilité est contrôlée à l’enregistrement.
          </p>
          {failure && (
            <p role="alert" className="hf-error">
              {failure}
            </p>
          )}
          <Button type="submit" disabled={busy || !property}>
            {busy ? "Enregistrement…" : "Enregistrer la réservation"}
          </Button>
        </fieldset>
      </form>
    </>
  );
}
export function PropertyStays({
  org,
  propertyId,
}: {
  org: string;
  propertyId: string;
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold">Réservations du logement</h2>
      <ReservationRows org={org} propertyId={propertyId} />
      <Blocks org={org} propertyId={propertyId} />
    </div>
  );
}
function Blocks({ org, propertyId }: { org: string; propertyId?: string }) {
  const [page, setPage] = useState(1);
  const [mode, setMode] = useState("true");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PropertyBlock | undefined>();
  const [release, setRelease] = useState<PropertyBlock | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const params = new URLSearchParams({ page: String(page), active: mode });
  if (propertyId) params.set("property_id", propertyId);
  const { data, error, loading, reload } = useStayResource<BlockList>(
    "/blocks?" + params,
    org,
  );
  const options = useStayResource<{ properties: PropertyOption[] }>(
    "/options",
    org,
  );
  async function releaseBlock() {
    if (!release) return;
    setBusy(true);
    setFailure("");
    try {
      const { organization_id, created_at, updated_at, created_by, ...input } =
        release;
      void organization_id;
      void created_at;
      void updated_at;
      void created_by;
      await stayRequest("/blocks/" + release.id, org, {
        method: "PUT",
        body: { ...input, active: false },
      });
      setRelease(null);
      reload();
      toast.success("Blocage levé.");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Action impossible.");
      setRelease(null);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="hf-panel mt-5 overflow-hidden">
      <div className="border-b bg-[#fbfcfb] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <h2 className="text-xl font-semibold">
            Blocages du logement{propertyId ? "" : " / portefeuille"}
          </h2>
          <Button
            variant="outline"
            onClick={() => {
              setEditing(undefined);
              setOpen(true);
            }}
          >
            <Plus />
            Nouveau blocage
          </Button>
        </div>
        <div className="max-w-xs">
          <Choice
            label="Afficher les blocages"
            value={mode}
            onChange={(v) => {
              setMode(v);
              setPage(1);
            }}
            items={[
              ["true", "Actifs"],
              ["false", "Levés"],
              ["all", "Tous"],
            ]}
          />
        </div>
        {open && (
          <BlockForm
            key={editing?.id || "new"}
            org={org}
            propertyId={propertyId}
            initial={editing}
            options={options.data?.properties || []}
            onClose={() => setOpen(false)}
            onSaved={() => {
              setOpen(false);
              reload();
            }}
          />
        )}
        {failure && (
          <p role="alert" className="hf-error mt-5">
            {failure}
          </p>
        )}
      </div>
      {error ? (
        <div className="p-5">
          <Failure error={error} retry={reload} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <Loading header={false} />
        </div>
      ) : data?.items.length ? (
        <div className="divide-y">
          {data.items.map((b) => (
            <div
              key={b.id}
              className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-6"
            >
              <div>
                <p className="font-semibold">
                  {blockReasons[b.reason]} {!b.active && "· Levé"}
                </p>
                <p className="text-sm hf-muted">
                  {options.data?.properties.find((p) => p.id === b.property_id)
                    ?.name || "Logement"}
                </p>
                <p className="mt-1">
                  {dateLabel(b.start_date)} → {dateLabel(b.end_date)}
                </p>
                {b.notes && (
                  <p className="text-sm whitespace-pre-wrap break-words mt-2">
                    {b.notes}
                  </p>
                )}
              </div>
              {b.active && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditing(b);
                      setOpen(true);
                    }}
                  >
                    Modifier le blocage
                  </Button>
                  <Button variant="outline" onClick={() => setRelease(b)}>
                    Lever le blocage
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          title="Aucun blocage"
          description="Aucun blocage pour ces critères."
        />
      )}
      {data && (
        <Pager page={page} total={data.total} setPage={setPage} embedded />
      )}
      <ConfirmPropertyAction
        open={!!release}
        onOpenChange={(v) => {
          if (!v) setRelease(null);
        }}
        title="Lever ce blocage ?"
        description="Le logement redevient disponible sur cette période. Le blocage reste dans l’historique."
        busy={busy}
        onConfirm={() => void releaseBlock()}
      />
    </section>
  );
}
function BlockForm({
  org,
  propertyId,
  initial,
  options,
  onClose,
  onSaved,
}: {
  org: string;
  propertyId?: string;
  initial?: PropertyBlock;
  options: PropertyOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [id] = useState(() => initial?.id || createId());
  const [property, setProperty] = useState(
    initial?.property_id || propertyId || "",
  );
  const [start, setStart] = useState(initial?.start_date || "");
  const [end, setEnd] = useState(initial?.end_date || "");
  const [reason, setReason] = useState(initial?.reason || "internal");
  const [notes, setNotes] = useState(initial?.notes || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    const parsed = blockInput.safeParse({
      id,
      property_id: property,
      start_date: start,
      end_date: end,
      reason,
      notes,
      active: true,
      version: initial?.version || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await stayRequest(initial ? "/blocks/" + id : "/blocks", org, {
        method: initial ? "PUT" : "POST",
        body: parsed.data,
      });
      toast.success("Blocage enregistré.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={save}
      className="mt-5 space-y-5 rounded-xl border bg-white p-5"
    >
      <h3 className="font-semibold">
        {initial ? "Modifier le blocage" : "Nouveau blocage"}
      </h3>
      <fieldset disabled={busy} className="space-y-5">
        <div className="grid sm:grid-cols-2 gap-4">
          <Choice
            label="Logement à bloquer"
            value={property}
            onChange={setProperty}
            items={options.map((p) => [p.id, p.name])}
            disabled={!!propertyId}
          />
          <Choice
            label="Motif"
            value={reason}
            onChange={(v) => setReason(v as PropertyBlock["reason"])}
            items={Object.entries(blockReasons)}
          />
          <Field
            label="Début du blocage"
            id="block-start"
            type="date"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Field
            label="Fin du blocage (exclusive)"
            id="block-end"
            type="date"
            required
            value={end}
            min={start}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="hf-field">
          <Label htmlFor="block-notes">Notes du blocage</Label>
          <Textarea
            id="block-notes"
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>
        {error && (
          <p role="alert" className="hf-error">
            {error}
          </p>
        )}
        <div className="flex gap-3">
          <Button type="submit" disabled={!property || busy}>
            {busy ? "Enregistrement…" : "Enregistrer le blocage"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            Fermer
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
