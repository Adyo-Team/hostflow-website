"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import {
  Button,
  PageHeader,
  Pager,
  StatusBadge,
} from "@/components/hostflow/ui";
import { Choice, Field, EmptyState } from "../shared";
import { Skeleton } from "@/components/ui/skeleton";
import type { Membership } from "@/lib/hostflow/types";
import type { CalendarData } from "@/lib/calendar/types";
import {
  addDays,
  dayDistance,
  occupiedDays,
  placement,
  todayInZone,
  validDate,
} from "@/lib/calendar/dates.mjs";
import { blockReasons, canManageReservations } from "@/lib/reservations/types";
import { useStayResource } from "../reservations/client";

const label = (date: string, short = false) =>
  new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: short ? "short" : "long",
    year: short ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
export function CalendarModule({ active }: { active?: Membership }) {
  if (!active || !canManageReservations(active.role))
    return (
      <div className="hf-panel p-6">
        <h1 className="hf-heading">Calendrier</h1>
        <p className="mt-3">
          L’accès au calendrier est réservé aux propriétaires de l’organisation,
          administrateurs et managers.
        </p>
      </div>
    );
  return <Calendar active={active} />;
}
function Calendar({ active }: { active: Membership }) {
  const query = useSearchParams();
  const router = useRouter();
  const today = todayInZone(active.organization?.timezone);
  const rawStart = query.get("start") || "";
  const start = validDate(rawStart) ? rawStart : today;
  const days = [7, 14, 31].includes(Number(query.get("days")))
    ? Number(query.get("days"))
    : 14;
  const page = Math.max(
    1,
    Math.min(10000, Math.floor(Number(query.get("page")) || 1)),
  );
  const end = addDays(start, days);
  const { data, loading, error, reload } = useStayResource<CalendarData>(
    `/calendar?start=${start}&end=${end}&page=${page}`,
    active.organization_id,
  );
  function navigate(date: string, length = days, propertyPage = page) {
    router.push(`/calendar?start=${date}&days=${length}&page=${propertyPage}`);
  }
  const rows = useMemo(
    () =>
      (data?.properties || []).map((p) => {
        const reservations = (data?.reservations || []).filter(
          (r) => r.property_id === p.id,
        );
        const blocks = (data?.blocks || []).filter(
          (b) => b.property_id === p.id,
        );
        const occupied = new Set<number>();
        for (const r of reservations)
          for (const day of occupiedDays(r.check_in, r.check_out, start, end))
            occupied.add(day);
        for (const b of blocks)
          for (const day of occupiedDays(b.start_date, b.end_date, start, end))
            occupied.add(day);
        return { property: p, reservations, blocks, occupied };
      }),
    [data, start, end],
  );
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <section className="min-w-0 space-y-5">
      <PageHeader
        title="Calendrier"
        eyebrow="Disponibilités du portefeuille"
        actions={
          <Button asChild>
            <Link prefetch={false} href="/reservations/new">
              <Plus className="size-4" />
              Nouvelle réservation
            </Link>
          </Button>
        }
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Période précédente"
            onClick={() => navigate(addDays(start, -days))}
          >
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => navigate(today)}>
            Aujourd’hui
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Période suivante"
            onClick={() => navigate(end)}
          >
            <ChevronRight />
          </Button>
          <p className="text-sm font-medium" aria-live="polite">
            {label(start)} — {label(addDays(end, -1))}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const date = String(
                new FormData(e.currentTarget).get("start") || "",
              );
              if (
                validDate(date) &&
                date >= "1900-01-01" &&
                date <= "9998-12-01"
              )
                navigate(date);
            }}
          >
            <Field
              key={start}
              id="calendar-start"
              name="start"
              label="À partir du"
              type="date"
              defaultValue={start}
              min="1900-01-01"
              max="9998-12-01"
              required
            />
            <Button type="submit" variant="outline">
              Afficher
            </Button>
          </form>
          <Choice
            label="Période"
            value={String(days)}
            onChange={(v) => navigate(start, Number(v))}
            items={[
              ["7", "7 jours"],
              ["14", "14 jours"],
              ["31", "31 jours"],
            ]}
          />
          <Button
            variant="outline"
            size="icon"
            className="h-11 w-11"
            disabled={loading}
            aria-label="Actualiser le calendrier"
            onClick={reload}
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <StatusBadge tone="success">Réservation confirmée</StatusBadge>
        <StatusBadge tone="warning">Blocage</StatusBadge>
        <span>Annulations et blocages levés masqués.</span>
      </div>
      {loading ? (
        <div
          role="status"
          aria-label="Chargement des disponibilités"
          aria-busy="true"
          className="hf-panel min-h-[280px] p-5 space-y-5"
        >
          <span className="sr-only">Chargement des disponibilités…</span>
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="hf-error flex flex-wrap items-center justify-between gap-3"
        >
          {error}
          <Button variant="outline" onClick={reload}>
            Réessayer
          </Button>
        </div>
      ) : data ? (
        <div className="hf-panel overflow-hidden">
          {!data.properties.length ? (
            <EmptyState
              title="Aucun logement sur cette page"
              description={
                page > 1
                  ? "Revenez à la page précédente pour retrouver vos logements."
                  : "Retrouvez ou ajoutez vos logements depuis la section Logements."
              }
            />
          ) : (
            <div
              key={`${active.organization_id}:${start}:${days}:${page}`}
              className="hf-calendar-scroll max-w-full overflow-auto overscroll-x-contain"
              role="region"
              aria-label="Calendrier multi-logements, défilement horizontal"
              tabIndex={0}
            >
              <div
                className="hf-calendar-grid"
                style={{
                  gridTemplateColumns: `var(--calendar-property-width) repeat(${days}, minmax(84px, 1fr))`,
                  width: `max(100%, calc(var(--calendar-property-width) + ${days * 84}px))`,
                }}
              >
                <div className="sticky left-0 top-0 z-40 flex items-center border-b border-r bg-muted p-3 text-sm font-semibold">
                  Logements
                </div>
                {dates.map((d) => (
                  <div
                    key={d}
                    className={`sticky top-0 z-30 border-b border-r py-3 text-center text-sm ${d === today ? "hf-calendar-today font-bold" : new Date(d + "T12:00:00Z").getUTCDay() % 6 === 0 ? "bg-muted font-medium" : "bg-card"}`}
                    aria-current={d === today ? "date" : undefined}
                  >
                    <div>
                      {new Intl.DateTimeFormat("fr-FR", {
                        weekday: "short",
                        timeZone: "UTC",
                      }).format(new Date(d + "T12:00:00Z"))}
                    </div>
                    <div className="mt-1">{label(d, true)}</div>
                    {d === today && <div className="mt-1">Aujourd’hui</div>}
                  </div>
                ))}
                {rows.map(
                  ({ property: p, reservations, blocks, occupied }, row) => {
                    const gridRow = row + 2;
                    return (
                      <div key={p.id} className="contents">
                        <Link
                          prefetch={false}
                          href={`/properties/${p.id}`}
                          style={{ gridRow, gridColumn: 1 }}
                          className="sticky left-0 z-20 flex min-h-[88px] flex-col justify-center border-b border-r bg-white px-3 py-4 text-sm font-medium hover:bg-[#f3f8f4]"
                        >
                          <span className="break-words">{p.name}</span>
                          <span className="mt-1 text-xs text-muted-foreground">
                            {p.capacity} voyageurs
                            {p.status !== "active" ? " · Inactif" : ""}
                          </span>
                        </Link>
                        {dates.map((d, i) => {
                          const available =
                            p.status === "active" && !occupied.has(i);
                          const cls = `min-h-[88px] border-b border-r ${d === today ? "hf-calendar-today-cell" : "bg-card"}`;
                          return available ? (
                            <Link
                              key={d}
                              prefetch={false}
                              href={`/reservations/new?property_id=${p.id}&check_in=${d}&check_out=${addDays(d, 1)}`}
                              style={{ gridRow, gridColumn: i + 2 }}
                              className={`${cls} hover:bg-[#e5f3eb] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2`}
                              aria-label={`Créer une réservation · ${p.name} · ${label(d)}`}
                            />
                          ) : (
                            <div
                              key={d}
                              style={{ gridRow, gridColumn: i + 2 }}
                              className={cls}
                            />
                          );
                        })}
                        {reservations.map((r) => {
                          const pos = placement(
                            r.check_in,
                            r.check_out,
                            start,
                            end,
                          );
                          return (
                            pos && (
                              <Link
                                key={r.id}
                                prefetch={false}
                                href={`/reservations/${r.id}`}
                                title={`${r.guest_name} · ${p.name} · ${label(r.check_in)} → ${label(r.check_out)} · Confirmée`}
                                aria-label={`${r.guest_name}, ${p.name}, ${label(r.check_in)} au ${label(r.check_out)}, ${dayDistance(r.check_in, r.check_out)} nuit${dayDistance(r.check_in, r.check_out) > 1 ? "s" : ""}, Confirmée`}
                                style={{
                                  gridRow,
                                  gridColumn: `${pos.offset + 2} / span ${pos.span}`,
                                }}
                                className="z-10 mx-1 my-3 flex min-w-0 flex-col justify-center hf-calendar-stay overflow-hidden rounded-md border px-2 text-sm"
                              >
                                <span className="truncate font-semibold">
                                  {r.check_in < start && "← "}
                                  {r.guest_name}
                                  {r.check_out > end && " →"}
                                </span>
                                <span className="truncate">
                                  {dayDistance(r.check_in, r.check_out)} nuit
                                  {dayDistance(r.check_in, r.check_out) > 1
                                    ? "s"
                                    : ""}{" "}
                                  · Confirmée
                                </span>
                              </Link>
                            )
                          );
                        })}
                        {blocks.map((b) => {
                          const pos = placement(
                            b.start_date,
                            b.end_date,
                            start,
                            end,
                          );
                          return (
                            pos && (
                              <Link
                                key={b.id}
                                prefetch={false}
                                href={`/properties/${p.id}`}
                                aria-label={`${blockReasons[b.reason]}, ${p.name}, ${label(b.start_date)} au ${label(b.end_date)}`}
                                title={`${blockReasons[b.reason]} · ${p.name} · ${label(b.start_date)} → ${label(b.end_date)}`}
                                style={{
                                  gridRow,
                                  gridColumn: `${pos.offset + 2} / span ${pos.span}`,
                                }}
                                className="z-10 mx-1 my-3 flex min-w-0 flex-col justify-center overflow-hidden rounded-md border border-dashed hf-calendar-block px-2 text-sm"
                              >
                                <span className="truncate font-semibold">
                                  {b.start_date < start && "← "}
                                  {blockReasons[b.reason]}
                                  {b.end_date > end && " →"}
                                </span>
                                <span className="truncate">
                                  Logement bloqué
                                </span>
                              </Link>
                            )
                          );
                        })}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          )}
          <div className="px-4 py-3 border-t text-sm text-muted-foreground">
            Cliquez sur une date libre pour réserver. Les flèches sur un séjour
            indiquent qu’il continue hors de la période affichée.
          </div>
          <Pager
            embedded
            page={page}
            total={data.total}
            setPage={(p) => navigate(start, days, p)}
          />
        </div>
      ) : null}
    </section>
  );
}
