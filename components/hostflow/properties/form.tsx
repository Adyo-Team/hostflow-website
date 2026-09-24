"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { propertyId } from "@/lib/properties/id";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Save,
  LockKeyhole,
} from "lucide-react";
import { Button, PageHeader } from "@/components/hostflow/ui";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Choice, countryItems } from "../shared";
import type { Membership } from "@/lib/hostflow/types";
import {
  typeLabels,
  type Amenity,
  type PropertyDetail,
} from "@/lib/properties/types";
import {
  defaultProperty,
  propertyFields,
  propertySchema,
  type PropertyInput,
} from "@/lib/properties/validation";
import { propertyRequest, usePropertyResource } from "./client";
import { useWorkspace } from "../client";
import {
  ConfirmPropertyAction,
  PropertyFailure,
  PropertyLoading,
} from "./shared";
import { PropertyPhotos } from "./photos";
const steps = [
  "Informations générales",
  "Localisation",
  "Exploitation",
  "Accès et instructions",
  "Équipements",
  "Photos",
];
const stepSchemas = [
  propertyFields
    .pick({
      name: true,
      internal_name: true,
      status: true,
      property_type: true,
      capacity: true,
      bedrooms: true,
      beds: true,
      bathrooms: true,
    })
    .strip(),
  propertyFields
    .pick({
      address_line1: true,
      address_line2: true,
      postal_code: true,
      city: true,
      country: true,
      latitude: true,
      longitude: true,
    })
    .strip()
    .refine(
      (v) => (v.latitude === null) === (v.longitude === null),
      "Renseignez les deux coordonnées ou laissez-les vides.",
    ),
  propertyFields
    .pick({
      check_in_time: true,
      check_out_time: true,
      cleaning_fee: true,
      management_commission_percent: true,
    })
    .strip(),
  propertyFields
    .pick({
      wifi_name: true,
      wifi_password: true,
      access_instructions: true,
      cleaning_instructions: true,
      private_notes: true,
    })
    .strip(),
];
const numericKeys = [
  "capacity",
  "bedrooms",
  "beds",
  "bathrooms",
  "latitude",
  "longitude",
  "cleaning_fee",
  "management_commission_percent",
] as const;
type NumericKey = (typeof numericKeys)[number];
function initialValues(
  data: PropertyDetail | undefined,
  country: string,
): PropertyInput {
  const defaults = defaultProperty(country);
  if (!data) return defaults;
  const values = Object.fromEntries(
    Object.keys(defaults).map((key) => [
      key,
      data.property[key as keyof PropertyInput],
    ]),
  ) as PropertyInput;
  return {
    ...values,
    status: values.status === "inactive" ? "inactive" : "active",
    check_in_time: values.check_in_time.slice(0, 5),
    check_out_time: values.check_out_time.slice(0, 5),
  };
}
export function PropertyForm({
  id,
  active,
  startPhotos = false,
  onDirtyChange,
}: {
  id?: string;
  active: Membership;
  startPhotos?: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const { data, error, loading, reload } = usePropertyResource<
    PropertyDetail | Amenity[]
  >(id ? "/" + id : "/catalog", active.organization_id);
  if (loading && !data) return <PropertyLoading variant="form" />;
  if (error) return <PropertyFailure error={error} retry={reload} />;
  if (!data) return null;
  const initial = Array.isArray(data) ? undefined : data;
  if (initial?.property.status === "archived")
    return (
      <div className="hf-panel p-7">
        <h1 className="hf-heading">Ce logement est archivé</h1>
        <p className="hf-subtitle mb-5">
          Restaurez-le depuis sa fiche avant de le modifier.
        </p>
        <Button asChild>
          <Link prefetch={false} href={"/properties/" + id}>
            Ouvrir la fiche
          </Link>
        </Button>
      </div>
    );
  return (
    <PropertyEditor
      active={active}
      initial={initial}
      catalog={Array.isArray(data) ? data : data.catalog}
      startPhotos={startPhotos}
      onDirtyChange={onDirtyChange}
    />
  );
}
function PropertyEditor({
  active,
  initial,
  catalog,
  startPhotos,
  onDirtyChange,
}: {
  active: Membership;
  initial?: PropertyDetail;
  catalog: Amenity[];
  startPhotos: boolean;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const { reload: reloadWorkspace } = useWorkspace();
  const [form, setForm] = useState(() =>
    initialValues(initial, active.organization?.country ?? "BE"),
  );
  const [numbers, setNumbers] = useState(
    () =>
      Object.fromEntries(
        numericKeys.map((k) => [k, String(form[k] ?? "")]),
      ) as Record<NumericKey, string>,
  );
  const [amenities, setAmenities] = useState(initial?.amenities ?? []);
  const [id] = useState(() => initial?.property.id ?? propertyId());
  const [version, setVersion] = useState<number | null>(
    initial?.property.version ?? null,
  );
  const [step, setStep] = useState(initial && startPhotos ? 5 : 0);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const [leaving, setLeaving] = useState<string | null>(null);
  const currency = active.organization?.currency ?? "EUR";
  function changed() {
    setDirty(true);
    dirtyRef.current = true;
    setSaved(false);
  }
  useEffect(() => {
    onDirtyChange(dirty || photoBusy);
    return () => onDirtyChange(false);
  }, [dirty, photoBusy, onDirtyChange]);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || photoBusy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [photoBusy]);
  useEffect(() => {
    const guard = (event: MouseEvent) => {
      if (
        (!dirty && !photoBusy) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link =
        event.target instanceof Element
          ? event.target.closest<HTMLAnchorElement>("a[href]")
          : null;
      if (!link || link.target === "_blank" || link.hasAttribute("download"))
        return;
      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin !== window.location.origin ||
        (destination.pathname === window.location.pathname &&
          destination.search === window.location.search)
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      setLeaving(destination.href);
    };
    document.addEventListener("click", guard, true);
    return () => document.removeEventListener("click", guard, true);
  }, [dirty, photoBusy]);
  function set<K extends keyof PropertyInput>(key: K, value: PropertyInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    changed();
  }
  function values(): PropertyInput {
    return {
      ...form,
      capacity: Number(numbers.capacity),
      bedrooms: Number(numbers.bedrooms),
      beds: Number(numbers.beds),
      bathrooms: Number(numbers.bathrooms),
      latitude: numbers.latitude === "" ? null : Number(numbers.latitude),
      longitude: numbers.longitude === "" ? null : Number(numbers.longitude),
      cleaning_fee:
        numbers.cleaning_fee === "" ? null : Number(numbers.cleaning_fee),
      management_commission_percent:
        numbers.management_commission_percent === ""
          ? null
          : Number(numbers.management_commission_percent),
    };
  }
  function numeric(
    key: NumericKey,
    label: string,
    min: number,
    max: number,
    increment = "1",
  ) {
    return (
      <Field
        id={key}
        label={label}
        type="number"
        inputMode="decimal"
        value={numbers[key]}
        min={min}
        max={max}
        step={increment}
        onChange={(e) => {
          setNumbers((n) => ({ ...n, [key]: e.target.value }));
          changed();
        }}
      />
    );
  }
  function text(
    key:
      | "name"
      | "internal_name"
      | "address_line1"
      | "address_line2"
      | "postal_code"
      | "city"
      | "wifi_name"
      | "wifi_password",
    label: string,
    max: number,
    required = false,
  ) {
    return (
      <Field
        id={key}
        label={label}
        value={form[key] ?? ""}
        maxLength={max}
        required={required}
        autoComplete={key === "wifi_password" ? "off" : undefined}
        type={key === "wifi_password" ? "password" : "text"}
        onChange={(e) => set(key, e.target.value)}
      />
    );
  }
  function notes(
    key: "access_instructions" | "cleaning_instructions" | "private_notes",
    label: string,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={key}>{label}</Label>
        <Textarea
          id={key}
          value={form[key] ?? ""}
          maxLength={5000}
          rows={4}
          onChange={(e) => set(key, e.target.value)}
          className="resize-y"
        />
      </div>
    );
  }
  async function next(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (lock.current) return;
    if (step < 4) {
      const parsed = stepSchemas[step].safeParse(values());
      if (!parsed.success) {
        setError(parsed.error.issues[0].message);
        return;
      }
      setStep(step + 1);
      return;
    }
    const parsed = propertySchema.safeParse(values());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const result = await propertyRequest<PropertyDetail>(
        version === null ? "" : "/" + id,
        active.organization_id,
        {
          method: version === null ? "POST" : "PUT",
          body: { id, version, property: parsed.data, amenities },
        },
      );
      setVersion(result.property.version);
      dirtyRef.current = false;
      setDirty(false);
      setSaved(true);
      setStep(5);
      void reloadWorkspace().catch(() => {});
      router.replace("/properties/" + id + "/edit?step=photos");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <ConfirmPropertyAction
        open={!!leaving}
        onOpenChange={(open) => {
          if (!open) setLeaving(null);
        }}
        title="Quitter ce formulaire ?"
        description={
          photoBusy
            ? "Un transfert est en cours. Attendez sa fin avant de quitter le formulaire."
            : "Les modifications non enregistrées seront perdues. Les informations et photos déjà enregistrées seront conservées."
        }
        busy={photoBusy || busy}
        onConfirm={() => {
          if (leaving && !photoBusy && !busy) {
            dirtyRef.current = false;
            setDirty(false);
            setLeaving(null);
            router.push(leaving);
          }
        }}
      />
      <Link
        prefetch={false}
        href={version === null ? "/properties" : "/properties/" + id}
        className="hf-link inline-flex items-center gap-2 mb-5"
      >
        <ArrowLeft className="size-4" />
        {version === null ? "Tous les logements" : "Retour à la fiche"}
      </Link>
      <PageHeader
        eyebrow="Votre portefeuille"
        title={
          version === null ? "Ajouter un logement" : "Modifier le logement"
        }
        description={
          form.name || "Rassemblez les informations utiles à votre équipe."
        }
      />
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        <nav aria-label="Étapes du formulaire" className="hf-panel p-3">
          <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1">
            {steps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={busy || photoBusy || index > step}
                  aria-current={index === step ? "step" : undefined}
                  onClick={() => {
                    setStep(index);
                    setError("");
                  }}
                  className={
                    "flex text-left items-center gap-2.5 w-full p-3 rounded-lg text-sm disabled:opacity-45 " +
                    (index === step
                      ? "bg-[#eaf3ed] text-[#246747] font-semibold"
                      : "text-[#738278]")
                  }
                >
                  <span className="size-6 shrink-0 grid place-items-center border rounded-full text-xs">
                    {index < step ? <Check className="size-3" /> : index + 1}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
        <section className="hf-panel p-5 md:p-8 min-w-0">
          <div className="flex justify-between gap-3 items-start mb-7">
            <h2 className="text-xl font-semibold">{steps[step]}</h2>
            <span className="hf-tag shrink-0">{step + 1} / 6</span>
          </div>
          {error && (
            <div role="alert" className="hf-error mb-5">
              {error}
              <p className="mt-2 text-sm">
                Vos saisies restent dans ce formulaire.
              </p>
            </div>
          )}
          {step < 5 ? (
            <form onSubmit={(e) => void next(e)} className="space-y-6">
              <fieldset disabled={busy} className="space-y-5 min-w-0">
                {step === 0 && (
                  <>
                    {text("name", "Nom du logement", 150, true)}
                    {text("internal_name", "Nom interne (facultatif)", 150)}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Choice
                        label="Type de logement"
                        value={form.property_type}
                        onChange={(v) =>
                          set(
                            "property_type",
                            v as PropertyInput["property_type"],
                          )
                        }
                        items={Object.entries(typeLabels)}
                      />
                      <Choice
                        label="Statut"
                        value={form.status}
                        onChange={(v) =>
                          set("status", v as "active" | "inactive")
                        }
                        items={[
                          ["active", "Actif"],
                          ["inactive", "Inactif"],
                        ]}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      {numeric("capacity", "Capacité (personnes)", 1, 1000)}
                      {numeric("bedrooms", "Chambres", 0, 1000)}
                      {numeric("beds", "Lits", 0, 1000)}
                      {numeric("bathrooms", "Salles de bain", 0, 1000, "0.1")}
                    </div>
                  </>
                )}
                {step === 1 && (
                  <>
                    {text("address_line1", "Adresse", 250, true)}
                    {text("address_line2", "Complément d’adresse", 250)}
                    <div className="grid sm:grid-cols-2 gap-4">
                      {text("postal_code", "Code postal", 30)}
                      {text("city", "Ville", 100, true)}
                    </div>
                    <Choice
                      label="Pays"
                      value={form.country}
                      onChange={(v) => set("country", v)}
                      items={countryItems}
                    />
                    <div className="border-t pt-5">
                      <p className="text-sm hf-muted mb-4">
                        Coordonnées GPS facultatives
                      </p>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {numeric("latitude", "Latitude", -90, 90, "0.000001")}
                        {numeric(
                          "longitude",
                          "Longitude",
                          -180,
                          180,
                          "0.000001",
                        )}
                      </div>
                    </div>
                  </>
                )}
                {step === 2 && (
                  <>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Field
                        id="check_in_time"
                        label="Heure d’arrivée"
                        type="time"
                        value={form.check_in_time}
                        required
                        onChange={(e) => set("check_in_time", e.target.value)}
                      />
                      <Field
                        id="check_out_time"
                        label="Heure de départ"
                        type="time"
                        value={form.check_out_time}
                        required
                        onChange={(e) => set("check_out_time", e.target.value)}
                      />
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {numeric(
                        "cleaning_fee",
                        "Frais de ménage (" + currency + ")",
                        0,
                        9999999999.99,
                        "0.01",
                      )}
                      {numeric(
                        "management_commission_percent",
                        "Commission de gestion (%)",
                        0,
                        100,
                        "0.01",
                      )}
                    </div>
                    <p className="text-sm hf-muted">
                      Laissez les montants vides s’ils ne sont pas encore
                      définis. La devise est celle de votre organisation.
                    </p>
                  </>
                )}
                {step === 3 && (
                  <>
                    <p className="text-sm hf-muted flex gap-2 items-start">
                      <LockKeyhole className="size-4 shrink-0 mt-0.5" />
                      Ces informations sont réservées aux responsables autorisés
                      de votre organisation.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      {text("wifi_name", "Nom du réseau Wi-Fi", 150)}
                      {text("wifi_password", "Mot de passe Wi-Fi", 250)}
                    </div>
                    {notes("access_instructions", "Instructions d’accès")}
                    {notes("cleaning_instructions", "Instructions de ménage")}
                    {notes("private_notes", "Notes privées")}
                  </>
                )}
                {step === 4 && (
                  <>
                    <p className="text-sm hf-muted">
                      Sélectionnez les équipements réellement disponibles dans
                      ce logement.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {catalog.map((a) => (
                        <label
                          key={a.id}
                          htmlFor={"amenity-" + a.id}
                          className="flex items-center gap-3 border rounded-lg p-4 cursor-pointer hover:bg-[#fafcfb]"
                        >
                          <Checkbox
                            id={"amenity-" + a.id}
                            checked={amenities.includes(a.id)}
                            onCheckedChange={(checked) => {
                              setAmenities((current) =>
                                checked === true
                                  ? [...current, a.id]
                                  : current.filter((x) => x !== a.id),
                              );
                              changed();
                            }}
                          />
                          <span className="text-sm">{a.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-sm hf-muted">
                      Le logement et ses équipements seront enregistrés avant
                      l’ajout des photos.
                    </p>
                  </>
                )}
              </fieldset>
              <div className="flex flex-wrap justify-between gap-3 border-t pt-5">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || step === 0}
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft />
                  Précédent
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <LoaderCircle className="animate-spin" />
                  ) : step === 4 ? (
                    <Save />
                  ) : null}
                  {busy
                    ? "Enregistrement…"
                    : step === 4
                      ? "Enregistrer et ajouter les photos"
                      : "Continuer"}
                  {step < 4 && <ArrowRight />}
                </Button>
              </div>
            </form>
          ) : (
            <>
              {saved && (
                <p role="status" className="hf-success mb-5">
                  Le logement et ses équipements sont enregistrés.
                </p>
              )}
              <PropertyPhotos
                organizationId={active.organization_id}
                propertyId={id}
                onBusyChange={setPhotoBusy}
                editable
              />
              <div className="flex flex-wrap justify-between gap-3 pt-6 border-t mt-6">
                <Button
                  type="button"
                  variant="outline"
                  disabled={photoBusy}
                  onClick={() => {
                    setStep(4);
                    setSaved(false);
                  }}
                >
                  <ArrowLeft />
                  Équipements
                </Button>
                <Button asChild disabled={photoBusy}>
                  <Link
                    prefetch={false}
                    aria-disabled={photoBusy}
                    onClick={(e) => {
                      if (photoBusy) e.preventDefault();
                    }}
                    href={"/properties/" + id}
                  >
                    Terminer et voir la fiche
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
