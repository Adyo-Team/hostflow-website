"use client";
import { PageHeader } from "./ui";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/hostflow/ui";
import {
  Field,
  Choice,
  timezoneItems,
  currencyItems,
  countryItems,
} from "./shared";
import { AccessGate } from "./access-gate";
import {
  roleLabels,
  canManageTeam,
  type WorkspaceState,
  type Membership,
  type Organization,
} from "@/lib/hostflow/types";
import type { Currency, Country } from "@/lib/hostflow/validation";
import type { Run } from "./client";
export function Settings({
  state,
  active,
  organization,
  run,
  busy,
}: {
  state: WorkspaceState;
  active?: Membership;
  organization?: Organization;
  run: Run;
  busy: boolean;
}) {
  const [name, setName] = useState(organization?.name ?? "");
  const [firstName, setFirstName] = useState(state.profile?.first_name ?? "");
  const [lastName, setLastName] = useState(state.profile?.last_name ?? "");
  const [phone, setPhone] = useState(state.profile?.phone ?? "");
  const [country, setCountry] = useState<Country | "">(
    (organization?.country as Country) ?? "",
  );
  const [timezone, setTimezone] = useState(
    organization?.timezone ?? "Europe/Brussels",
  );
  const [currency, setCurrency] = useState<Currency>(
    (organization?.currency as Currency) ?? "EUR",
  );
  const admin = canManageTeam(active?.role);
  return (
    <>
      <PageHeader
        eyebrow="Votre organisation"
        title="Paramètres"
        description="Un espace qui correspond à votre façon de travailler."
      />
      {state.user ? (
        <div className="grid xl:grid-cols-[1.3fr_1fr] gap-6">
          <AccessGate state={state} active={active}>
            <section className="hf-panel p-6 md:p-8">
              <h2 className="hf-panel-title mb-6">
                Informations de l’organisation
              </h2>
              <form
                className="hf-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (active)
                    await run(
                      {
                        action: "updateOrganization",
                        organizationId: active.organization_id,
                        name,
                        timezone,
                        currency,
                        country: country as Country,
                      },
                      "Organisation mise à jour.",
                    );
                }}
              >
                <Field
                  id="organization-name"
                  label="Nom de la conciergerie"
                  required
                  minLength={2}
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!admin}
                />
                <Field
                  id="organization-slug"
                  label="Identifiant de l’espace"
                  value={organization?.slug ?? ""}
                  readOnly
                />
                <Choice
                  label="Pays"
                  value={country}
                  onChange={(v) => setCountry(v as Country)}
                  items={countryItems}
                  disabled={!admin}
                />
                <Choice
                  label="Fuseau horaire"
                  value={timezone}
                  onChange={setTimezone}
                  items={timezoneItems}
                  disabled={!admin}
                />
                <Choice
                  label="Devise de référence"
                  value={currency}
                  onChange={(v) => setCurrency(v as Currency)}
                  items={currencyItems}
                  disabled={!admin}
                />
                {admin ? (
                  <Button
                    type="submit"
                    disabled={busy || !country}
                    className="self-start h-11"
                  >
                    Enregistrer les modifications
                  </Button>
                ) : (
                  <p className="text-sm hf-muted">
                    Seul un administrateur peut modifier ces informations.
                  </p>
                )}
              </form>
            </section>
          </AccessGate>
          <div className="space-y-6">
            <section className="hf-panel p-6 md:p-8">
              <h2 className="hf-panel-title mb-6">Votre profil personnel</h2>
              <form
                className="hf-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await run(
                    {
                      action: "updateProfile",
                      firstName,
                      lastName,
                      phone,
                    },
                    "Profil mis à jour.",
                  );
                }}
              >
                <Field
                  id="profile-first-name"
                  label="Prénom"
                  autoComplete="given-name"
                  required
                  maxLength={100}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
                <Field
                  id="profile-last-name"
                  label="Nom"
                  autoComplete="family-name"
                  required
                  maxLength={100}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
                <Field
                  id="profile-phone"
                  label="Téléphone (facultatif)"
                  type="tel"
                  autoComplete="tel"
                  maxLength={30}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Field
                  id="profile-email"
                  label="Email de connexion"
                  value={state.user?.email ?? ""}
                  readOnly
                />
                <Button
                  type="submit"
                  variant="outline"
                  className="self-start h-11"
                  disabled={busy}
                >
                  Enregistrer mon profil
                </Button>
              </form>
            </section>
            <div className="hf-panel p-6 flex gap-4">
              <ShieldCheck className="size-6 text-primary shrink-0" />
              <div>
                <h2 className="text-sm font-semibold">Votre accès</h2>
                <p className="text-sm hf-muted mt-1">
                  {active && roleLabels[active.role]}
                </p>
                <Link
                  prefetch={false}
                  href="/roles"
                  className="hf-link inline-block mt-3"
                >
                  Consulter les permissions
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <AccessGate state={state} active={active}>
          {null}
        </AccessGate>
      )}
    </>
  );
}
