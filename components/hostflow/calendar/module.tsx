"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Membership } from "@/lib/hostflow/types";
import type { CalendarData } from "@/lib/calendar/types";
import { addDays, dayDistance, overlaps, placement, todayInZone, validDate } from "@/lib/calendar/dates.mjs";
import { blockReasons, canManageReservations } from "@/lib/reservations/types";
import { useStayResource } from "../reservations/client";

const label = (date: string, short = false) => new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: short ? "short" : "long", year: short ? undefined : "numeric", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
export function CalendarModule({ active }: { active?: Membership }) {
  if (!active || !canManageReservations(active.role)) return <div className="hf-panel p-6"><h1 className="hf-heading">Calendrier</h1><p className="mt-3">L’accès au calendrier est réservé aux propriétaires de l’organisation, administrateurs et managers.</p></div>;
  return <Calendar active={active} />;
}
function Calendar({ active }: { active: Membership }) {
  const query = useSearchParams();
  const router = useRouter();
  const today = todayInZone(active.organization?.timezone);
  const rawStart = query.get("start") || "";
  const start = validDate(rawStart) ? rawStart : today;
  const days = [7, 14, 31].includes(Number(query.get("days"))) ? Number(query.get("days")) : 14;
  const page = Math.max(1, Math.min(10000, Math.floor(Number(query.get("page")) || 1)));
  const end = addDays(start, days);
  const { data, loading, error, reload } = useStayResource<CalendarData>(`/calendar?start=${start}&end=${end}&page=${page}`, active.organization_id);
  function navigate(date: string, length = days, propertyPage = page) { router.push(`/calendar?start=${date}&days=${length}&page=${propertyPage}`); }
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  return <section className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="hf-overline mb-3">Disponibilités du portefeuille</p><h1 className="hf-heading">Calendrier</h1></div>
      <Button asChild><Link prefetch={false} href="/reservations/new"><Plus className="size-4" />Nouvelle réservation</Link></Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="icon" aria-label="Période précédente" onClick={() => navigate(addDays(start, -days))}><ChevronLeft /></Button>
        <Button variant="outline" onClick={() => navigate(today)}>Aujourd’hui</Button>
        <Button variant="outline" size="icon" aria-label="Période suivante" onClick={() => navigate(end)}><ChevronRight /></Button>
        <p className="text-sm font-medium" aria-live="polite">{label(start)} — {label(addDays(end, -1))}</p>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-sm" htmlFor="calendar-length">Période</label>
        <select id="calendar-length" className="h-9 rounded-lg border bg-white px-2 text-sm" value={days} onChange={e => navigate(start, Number(e.target.value))}><option value={7}>7 jours</option><option value={14}>14 jours</option><option value={31}>31 jours</option></select>
        <Button variant="outline" size="icon" aria-label="Actualiser le calendrier" onClick={reload}><RefreshCw className="size-4" /></Button>
      </div>
    </div>
    <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span>● Réservation confirmée</span><span className="text-amber-800">▧ Blocage</span><span>Les séjours annulés et blocages levés ne bloquent pas les dates.</span></div>
    {loading ? <div role="status" className="hf-panel p-6">Chargement des disponibilités…</div> : error ? <div role="alert" className="hf-error flex flex-wrap items-center justify-between gap-3">{error}<Button variant="outline" onClick={reload}>Réessayer</Button></div> : data ? <div className="hf-panel overflow-hidden">
      {!data.properties.length ? <p className="p-6">Aucun logement sur cette page. Ajoutez un logement actif dans Properties pour commencer.</p> : <div className="max-w-full overflow-x-auto overscroll-x-contain" role="region" aria-label="Calendrier multi-logements, défilement horizontal" tabIndex={0}>
        <div className="hf-calendar-grid" style={{ gridTemplateColumns: `var(--calendar-property-width) repeat(${days}, 84px)` }}>
          <div className="sticky left-0 z-20 flex items-center border-b border-r bg-[#f7f9f7] p-3 text-sm font-semibold">Logements</div>
          {dates.map(d => <div key={d} className={`border-b border-r py-3 text-center text-xs ${d === today ? "bg-[#dcefe3] font-bold text-[#245e43]" : "bg-[#f7f9f7]"}`} aria-current={d === today ? "date" : undefined}><div>{new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(new Date(d + "T12:00:00Z"))}</div><div className="mt-1">{label(d, true)}</div>{d === today && <div className="mt-1">Aujourd’hui</div>}</div>)}
          {data.properties.map((p, row) => {
            const reservations = data.reservations.filter(r => r.property_id === p.id);
            const blocks = data.blocks.filter(b => b.property_id === p.id);
            const gridRow = row + 2;
            return <div key={p.id} className="contents">
              <Link prefetch={false} href={`/properties/${p.id}`} style={{ gridRow, gridColumn: 1 }} className="sticky left-0 z-20 flex min-h-[88px] flex-col justify-center border-b border-r bg-white px-3 py-4 text-sm font-medium hover:bg-[#f3f8f4]"><span className="break-words">{p.name}</span><span className="mt-1 text-xs text-muted-foreground">{p.capacity} voyageurs{p.status !== "active" ? " · Inactif" : ""}</span></Link>
              {dates.map((d, i) => {
                const available = p.status === "active" && !reservations.some(r => overlaps(d, addDays(d, 1), r.check_in, r.check_out)) && !blocks.some(b => overlaps(d, addDays(d, 1), b.start_date, b.end_date));
                const cls = `min-h-[88px] border-b border-r ${d === today ? "bg-[#f0f8f2]" : "bg-white"}`;
                return available ? <Link key={d} prefetch={false} href={`/reservations/new?property_id=${p.id}&check_in=${d}&check_out=${addDays(d, 1)}`} style={{ gridRow, gridColumn: i + 2 }} className={`${cls} hover:bg-[#e5f3eb] focus-visible:outline-2 focus-visible:outline-primary focus-visible:-outline-offset-2`} aria-label={`Créer une réservation · ${p.name} · ${label(d)}`} /> : <div key={d} style={{ gridRow, gridColumn: i + 2 }} className={cls} />;
              })}
              {reservations.map(r => {
                const pos = placement(r.check_in, r.check_out, start, end);
                return pos && <Link key={r.id} prefetch={false} href={`/reservations/${r.id}`} title={`${r.guest_name} · ${p.name} · ${label(r.check_in)} → ${label(r.check_out)} · Confirmée`} aria-label={`${r.guest_name}, ${p.name}, ${label(r.check_in)} au ${label(r.check_out)}, ${dayDistance(r.check_in, r.check_out)} nuits, Confirmée`} style={{ gridRow, gridColumn: `${pos.offset + 2} / span ${pos.span}` }} className="z-10 mx-1 my-3 flex min-w-0 flex-col justify-center overflow-hidden rounded-md border border-[#b8d9c5] bg-[#deeee4] px-2 text-xs text-[#245e43] hover:bg-[#cee5d7]"><span className="truncate font-semibold">{r.guest_name}</span><span className="truncate">{dayDistance(r.check_in, r.check_out)} nuits · Confirmée</span></Link>;
              })}
              {blocks.map(b => {
                const pos = placement(b.start_date, b.end_date, start, end);
                return pos && <Link key={b.id} prefetch={false} href={`/properties/${p.id}`} title={`${blockReasons[b.reason]} · ${p.name} · ${label(b.start_date)} → ${label(b.end_date)}`} style={{ gridRow, gridColumn: `${pos.offset + 2} / span ${pos.span}` }} className="z-10 mx-1 my-3 flex min-w-0 flex-col justify-center overflow-hidden rounded-md border border-dashed border-amber-400 bg-amber-50 px-2 text-xs text-amber-900"><span className="truncate font-semibold">▧ {blockReasons[b.reason]}</span><span className="truncate">Logement bloqué</span></Link>;
              })}
            </div>;
          })}
        </div>
      </div>}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-[#fbfcfb] px-4 py-3 text-xs text-muted-foreground"><span>{data.total} logements · page {page} · Cliquez sur une date libre pour réserver.</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => navigate(start, days, page - 1)}>Logements précédents</Button><Button size="sm" variant="outline" disabled={page * 30 >= data.total} onClick={() => navigate(start, days, page + 1)}>Logements suivants</Button></div></div>
    </div> : null}
  </section>;
}
