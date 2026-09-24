"use client";
import { PageHeader, Pager, FilterBar } from "@/components/hostflow/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Building2,
  Plus,
  Search,
  Users,
  MapPin,
  ArrowUpRight,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/hostflow/ui";
import { Input } from "@/components/ui/input";
import { EmptyState, Choice } from "../shared";
import {
  typeLabels,
  type PropertyList as ListData,
} from "@/lib/properties/types";
import { usePropertyResource } from "./client";
import {
  PropertyLoading,
  PropertyFailure,
  PropertyPhoto,
  PropertyStatusBadge,
} from "./shared";
export function PropertyList({ organizationId }: { organizationId: string }) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("active");
  const [city, setCity] = useState("");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = new URLSearchParams({
    search: debounced,
    status,
    city,
    type,
    sort,
    page: String(page),
  }).toString();
  const { data, previousData, error, loading, reload } =
    usePropertyResource<ListData>("?" + query, organizationId);
  const filter = (setter: (v: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };
  const filtered =
    !!debounced || !!city || type !== "all" || status !== "active";
  const pages = Math.max(
    1,
    Math.ceil((data?.total ?? 0) / (data?.pageSize ?? 12)),
  );
  return (
    <>
      <PageHeader
        eyebrow="Votre portefeuille"
        title="Logements"
        description="Toutes les informations de vos logements, au même endroit."
        actions={
          <>
            <Button asChild className="h-11">
              <Link prefetch={false} href="/properties/new">
                <Plus className="size-4" />
                Ajouter un logement
              </Link>
            </Button>
          </>
        }
      />
      <section
        className="hf-panel p-5 mb-6 space-y-4"
        aria-label="Recherche et filtres"
      >
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="size-4 hf-muted" />
          <h2 className="font-semibold text-sm">Retrouver un logement</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-3 size-4 hf-muted" />
          <Input
            aria-label="Rechercher un logement"
            placeholder="Nom, nom interne ou ville…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 h-11"
          />
        </div>
        <FilterBar className="grid-cols-2 lg:grid-cols-4 hf-filter-inline">
          <Choice
            label="Statut"
            value={status}
            onChange={filter(setStatus)}
            items={[
              ["active", "Actifs"],
              ["inactive", "Inactifs"],
              ["archived", "Archivés"],
              ["all", "Tous les statuts"],
            ]}
          />
          <Choice
            label="Ville"
            value={city || "all"}
            onChange={(v) => filter(setCity)(v === "all" ? "" : v)}
            items={[
              ["all", "Toutes les villes"],
              ...Array.from(
                new Set([
                  ...(data?.cities ?? previousData?.cities ?? []),
                  ...(city ? [city] : []),
                ]),
              ).map((c): [string, string] => [c, c]),
            ]}
          />
          <Choice
            label="Type"
            value={type}
            onChange={filter(setType)}
            items={[["all", "Tous les types"], ...Object.entries(typeLabels)]}
          />
          <Choice
            label="Trier par"
            value={sort}
            onChange={filter(setSort)}
            items={[
              ["newest", "Plus récents"],
              ["name", "Nom A → Z"],
              ["city", "Ville A → Z"],
              ["capacity", "Capacité croissante"],
            ]}
          />
        </FilterBar>
      </section>
      {error ? (
        <PropertyFailure error={error} retry={reload} />
      ) : loading ? (
        <PropertyLoading header={false} />
      ) : (
        data && (
          <>
            <div className="flex flex-wrap justify-between items-center gap-3 mb-4 text-sm hf-muted">
              <p role="status">
                {data.total} logement{data.total !== 1 ? "s" : ""}
                {status === "active"
                  ? " actif" + (data.total !== 1 ? "s" : "")
                  : ""}
              </p>
              {filtered && (
                <button
                  className="hf-link"
                  onClick={() => {
                    setSearch("");
                    setDebounced("");
                    setCity("");
                    setStatus("active");
                    setType("all");
                    setPage(1);
                  }}
                >
                  Réinitialiser les filtres
                </button>
              )}
            </div>
            {data.items.length ? (
              <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
                {data.items.map((p) => (
                  <Link
                    prefetch={false}
                    href={"/properties/" + p.id}
                    key={p.id}
                    className="hf-panel overflow-hidden hover:border-[#9ebaaa] transition-colors group"
                  >
                    <div className="relative h-48">
                      <PropertyPhoto
                        org={organizationId}
                        id={p.id}
                        imageId={p.cover_id}
                        alt={p.name}
                      />
                      <div className="absolute top-3 left-3">
                        <PropertyStatusBadge status={p.status} />
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="flex gap-3 items-start justify-between">
                        <h2 className="font-semibold text-lg break-words">
                          {p.name}
                        </h2>
                        <ArrowUpRight className="size-4 shrink-0 mt-1 text-[#6c8977]" />
                      </div>
                      <p className="mt-2 flex items-center gap-1.5 text-sm hf-muted">
                        <MapPin className="size-3.5" />
                        {p.city} · {p.country}
                      </p>
                      <div className="flex flex-wrap gap-4 mt-5 text-sm">
                        <span>{typeLabels[p.property_type]}</span>
                        <span className="flex items-center gap-1.5">
                          <Users className="size-4 hf-muted" />
                          {p.capacity} personnes
                        </span>
                      </div>
                      <p className="text-xs hf-muted border-t pt-3 mt-4">
                        Propriétaire non attribué
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="hf-panel">
                <EmptyState
                  icon={Building2}
                  title={
                    filtered
                      ? "Aucun logement ne correspond à ces filtres."
                      : data.cities.length
                        ? "Aucun logement actif pour le moment."
                        : "Aucun logement pour le moment."
                  }
                  description={
                    filtered
                      ? "Modifiez votre recherche ou réinitialisez les filtres."
                      : "Ajoutez votre premier logement pour réunir ses informations, ses équipements et ses photos."
                  }
                >
                  <Button asChild>
                    <Link prefetch={false} href="/properties/new">
                      <Plus />
                      Ajouter un logement
                    </Link>
                  </Button>
                </EmptyState>
              </div>
            )}
            {pages > 1 && (
              <Pager
                page={page}
                total={data?.total ?? 0}
                pageSize={data?.pageSize ?? 12}
                setPage={setPage}
              />
            )}
          </>
        )
      )}
    </>
  );
}
