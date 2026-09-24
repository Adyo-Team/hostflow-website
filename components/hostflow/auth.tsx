"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/hostflow/ui";
import {
  Brand,
  Field,
  Choice,
  timezoneItems,
  currencyItems,
  countryItems,
} from "./shared";
import { mutate, useWorkspace } from "./client";
import { WelcomeAccount } from "./welcome";
import type { Currency, Country, Mutation } from "@/lib/hostflow/validation";
export type AuthMode =
  | "login"
  | "signup"
  | "forgot-password"
  | "reset-password"
  | "onboarding"
  | "welcome"
  | "invite";
const content: Record<
  AuthMode,
  { title: string; intro: string; action: string }
> = {
  login: {
    title: "Ravi de vous retrouver.",
    intro: "Connectez-vous à votre espace de travail.",
    action: "Se connecter",
  },
  signup: {
    title: "Bienvenue sur HostFlow.",
    intro:
      "Créez votre compte personnel pour rejoindre une équipe ou lancer votre conciergerie.",
    action: "Créer mon compte",
  },
  "forgot-password": {
    title: "Un nouvel accès.",
    intro: "Nous vous enverrons un lien pour choisir un nouveau mot de passe.",
    action: "Recevoir le lien",
  },
  "reset-password": {
    title: "Nouveau mot de passe.",
    intro: "Choisissez un mot de passe d’au moins 12 caractères.",
    action: "Enregistrer mon mot de passe",
  },
  onboarding: {
    title: "Créons votre espace.",
    intro: "Quelques informations pour configurer votre organisation.",
    action: "Créer mon organisation",
  },
  welcome: {
    title: "Votre compte est prêt.",
    intro: "Rejoignez votre équipe ou créez l’espace de votre conciergerie.",
    action: "Continuer",
  },
  invite: {
    title: "Rejoindre votre équipe.",
    intro:
      "Connectez-vous avec l’adresse email destinataire de cette invitation.",
    action: "Accepter l’invitation",
  },
};
const subscribeLocation = (listener: () => void) => {
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
};
function invitationContext() {
  let saved = "";
  try {
    saved = sessionStorage.getItem("hf-pending-invitation") ?? "";
  } catch {
    /* Storage can be disabled. Incoming links still work. */
  }
  return window.location.search + "|" + saved;
}
export function AuthPage({ mode }: { mode: AuthMode }) {
  const { state, loading, error: connectionError } = useWorkspace();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [country, setCountry] = useState<Country>("BE");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timezone, setTimezone] = useState("Europe/Brussels");
  const [currency, setCurrency] = useState<Currency>("EUR");
  const context = useSyncExternalStore(
    subscribeLocation,
    invitationContext,
    () => "",
  );
  const [search, savedToken = ""] = context.split("|");
  const query = new URLSearchParams(search);
  const token = query.get("token") ?? savedToken;
  const queryError = query.has("error")
    ? "Le lien est invalide ou a expiré. Réessayez ou demandez un nouveau lien."
    : "";
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (/^[a-f0-9]{64}$/.test(token)) {
      try {
        sessionStorage.setItem("hf-pending-invitation", token);
      } catch {
        /* Optional persistence. */
      }
    }
  }, [token]);
  useEffect(() => {
    if (loading || connectionError || !state.user) return;
    const pending = /^[a-f0-9]{64}$/.test(token) ? token : null;
    if (
      ["login", "signup", "onboarding", "welcome"].includes(mode) &&
      pending
    ) {
      window.location.replace("/invite?token=" + encodeURIComponent(pending));
    } else if (mode === "login" || mode === "signup") {
      window.location.replace(state.memberships.length ? "/" : "/welcome");
    } else if (mode === "welcome" && state.memberships.length) {
      window.location.replace("/");
    }
  }, [
    loading,
    connectionError,
    state.user,
    state.memberships.length,
    mode,
    token,
  ]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (
      (mode === "signup" || mode === "reset-password") &&
      password !== confirmation
    ) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }
    let input: Mutation;
    switch (mode) {
      case "welcome":
        return;
      case "login":
        input = { action: "login", email, password };
        break;
      case "signup":
        input = { action: "signup", email, password, firstName, lastName };
        break;
      case "forgot-password":
        input = { action: "forgotPassword", email };
        break;
      case "reset-password":
        input = { action: "resetPassword", password };
        break;
      case "onboarding":
        input = {
          action: "createOrganization",
          name,
          slug,
          timezone,
          currency,
          country,
        };
        break;
      case "invite":
        input = { action: "acceptInvitation", token };
        break;
    }
    setBusy(true);
    try {
      const result = await mutate(input);
      if (mode === "login")
        window.location.href = token
          ? "/invite?token=" + encodeURIComponent(token)
          : "/";
      else if (mode === "signup" && result.signedIn)
        window.location.href = token
          ? "/invite?token=" + encodeURIComponent(token)
          : "/welcome";
      else if (mode === "onboarding")
        window.location.href = "/team?onboarding=1";
      else if (mode === "invite") {
        try {
          sessionStorage.removeItem("hf-pending-invitation");
        } catch {
          /* Optional persistence. */
        }
        window.location.href = "/";
      } else if (mode === "reset-password") window.location.href = "/login";
      else {
        setMessage(result.message ?? "Votre demande a été enregistrée.");
        setPassword("");
        setConfirmation("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Une erreur est survenue.");
    } finally {
      setBusy(false);
    }
  }
  const needsSession =
    mode === "onboarding" ||
    mode === "welcome" ||
    mode === "invite" ||
    mode === "reset-password";
  const awaitingLogin =
    needsSession && !loading && state.configured && !state.user;
  return (
    <div className="hf-auth">
      <aside className="hf-auth-aside">
        <Brand light />
        <div className="py-16">
          <span className="text-[12px] font-semibold uppercase tracking-[2px] text-[#80d3aa]">
            L’hospitalité, simplement.
          </span>
          <h2 className="mt-6">
            Tout votre quotidien.
            <br />
            <span className="text-[#91ddb4]">Un seul espace.</span>
          </h2>
          <p className="mt-7 max-w-[360px] text-base leading-relaxed text-[#bed4c7]">
            Moins de dispersion, plus de temps pour vos logements, votre équipe
            et vos voyageurs.
          </p>
          <div className="flex gap-6 mt-12 border-t border-[#426258] pt-7">
            <div>
              <ShieldCheck className="size-5 text-[#87cba3] mb-3" />
              <p className="text-sm">Des accès maîtrisés</p>
            </div>
            <div>
              <Users className="size-5 text-[#87cba3] mb-3" />
              <p className="text-sm">Une équipe réunie</p>
            </div>
          </div>
        </div>
        <span className="text-xs text-[#88a795]">
          HostFlow · Votre conciergerie, en toute clarté.
        </span>
      </aside>
      <main className="hf-auth-main">
        <div className="w-full max-w-[420px]">
          <div className="lg:hidden mb-12">
            <Brand />
          </div>
          <Link
            prefetch={false}
            href="/"
            className="text-sm text-[#7d8a83] flex gap-2 items-center mb-9 hover:text-primary"
          >
            <ArrowLeft className="size-4" />
            Retour à l’espace
          </Link>
          {mode === "onboarding" && (
            <ol
              aria-label="Progression de votre inscription"
              className="flex flex-wrap gap-x-4 gap-y-2 text-xs hf-muted mb-7"
            >
              <li className={state.user ? "text-primary" : "font-semibold"}>
                1. Créer votre compte
              </li>
              <li
                className={
                  mode === "onboarding" ? "text-primary font-semibold" : ""
                }
              >
                2. Configurer votre organisation
              </li>
              <li>3. Constituer votre équipe</li>
            </ol>
          )}
          <h1 className="text-[30px] font-semibold tracking-[-1px]">
            {content[mode].title}
          </h1>
          <p className="hf-subtitle mb-8">{content[mode].intro}</p>
          {mode === "signup" && /^[a-f0-9]{64}$/.test(token) && (
            <p className="hf-success mb-5 text-sm">
              Après confirmation de votre compte, vous pourrez accepter votre
              invitation sans créer d’organisation.
            </p>
          )}
          {mode === "onboarding" && (
            <p className="text-sm hf-muted mb-6">
              Vous souhaitez rejoindre une équipe ?{" "}
              <a className="hf-link" href="/welcome">
                Utiliser une invitation
              </a>
            </p>
          )}
          {!loading && !state.configured && (
            <div className="rounded-lg bg-[#f0f5f1] border px-4 py-3 text-sm text-[#5d7565] mb-6 leading-relaxed">
              La connexion au service est en cours de configuration. La création
              de compte et la connexion seront disponibles une fois cette étape
              terminée.
            </div>
          )}
          {(error || connectionError || queryError) && (
            <div role="alert" className="hf-error mb-5">
              {error || connectionError || queryError}
            </div>
          )}
          {message && (
            <div role="status" className="hf-success mb-5">
              {message}
            </div>
          )}
          {awaitingLogin ? (
            <div className="space-y-4">
              <p className="text-sm hf-muted">
                {mode === "invite"
                  ? "Votre invitation sera conservée pendant la connexion ou l’inscription."
                  : "Connectez-vous pour continuer. Pour réinitialiser le mot de passe, ouvrez le lien reçu par email."}
              </p>
              <Button asChild className="w-full h-11">
                <a href="/login">
                  Se connecter
                  <ArrowRight />
                </a>
              </Button>
              <a className="hf-link block text-center" href="/signup">
                Créer un compte
              </a>
            </div>
          ) : mode === "welcome" ? (
            loading ? (
              <p role="status" className="text-sm hf-muted">
                Chargement de votre compte…
              </p>
            ) : state.user && !connectionError ? (
              <WelcomeAccount email={state.user.email} onError={setError} />
            ) : null
          ) : (
            <form className="hf-form" onSubmit={submit}>
              {(mode === "login" ||
                mode === "signup" ||
                mode === "forgot-password") && (
                <Field
                  id="email"
                  label="Adresse email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@exemple.fr"
                />
              )}
              {(mode === "login" ||
                mode === "signup" ||
                mode === "reset-password") && (
                <>
                  <Field
                    id="password"
                    label="Mot de passe"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    required
                    minLength={mode === "login" ? 1 : 12}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      mode === "login"
                        ? "Votre mot de passe"
                        : "12 caractères minimum"
                    }
                  />
                  {mode === "login" && (
                    <a
                      href="/forgot-password"
                      className="hf-link text-right -mt-2"
                    >
                      Mot de passe oublié ?
                    </a>
                  )}
                </>
              )}
              {(mode === "signup" || mode === "reset-password") && (
                <Field
                  id="confirm-password"
                  label="Confirmer le mot de passe"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
                  maxLength={128}
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  placeholder="Confirmez votre mot de passe"
                />
              )}
              {mode === "signup" && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    id="first-name"
                    label="Prénom"
                    autoComplete="given-name"
                    required
                    maxLength={100}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                  <Field
                    id="last-name"
                    label="Nom"
                    autoComplete="family-name"
                    required
                    maxLength={100}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              )}
              {mode === "onboarding" && (
                <>
                  <Field
                    id="name"
                    label="Nom de la conciergerie"
                    required
                    minLength={2}
                    maxLength={100}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setSlug(
                        e.target.value
                          .normalize("NFD")
                          .replace(/[\u0300-\u036f]/g, "")
                          .toLowerCase()
                          .replace(/[^a-z0-9]+/g, "-")
                          .replace(/^-|-$/g, "")
                          .slice(0, 60),
                      );
                    }}
                    placeholder="Ma conciergerie"
                  />
                  <Field
                    id="slug"
                    label="Identifiant de l’espace"
                    required
                    minLength={3}
                    maxLength={60}
                    pattern="[a-z0-9]+(-[a-z0-9]+)*"
                    value={slug}
                    onChange={(e) => setSlug(e.target.value)}
                    placeholder="ma-conciergerie"
                  />
                  <Choice
                    label="Pays"
                    value={country}
                    onChange={(v) => setCountry(v as Country)}
                    items={countryItems}
                  />
                  <div className="grid sm:grid-cols-2 gap-4">
                    <Choice
                      label="Fuseau horaire"
                      value={timezone}
                      onChange={setTimezone}
                      items={timezoneItems}
                    />
                    <Choice
                      label="Devise"
                      value={currency}
                      onChange={(v) => setCurrency(v as Currency)}
                      items={currencyItems}
                    />
                  </div>
                </>
              )}
              {mode === "invite" && state.user && (
                <div className="text-sm hf-muted">
                  Compte connecté :{" "}
                  <strong className="break-all">{state.user.email}</strong>
                  <button
                    type="button"
                    className="hf-link block mt-2"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try {
                        await mutate({ action: "logout" });
                        window.location.href = "/login";
                      } catch {
                        setError("Déconnexion impossible. Réessayez.");
                        setBusy(false);
                      }
                    }}
                  >
                    Utiliser un autre compte
                  </button>
                </div>
              )}
              {mode === "invite" && (
                <button
                  type="button"
                  className="hf-link text-left"
                  disabled={busy}
                  onClick={() => {
                    try {
                      sessionStorage.removeItem("hf-pending-invitation");
                    } catch {
                      /* Optional persistence. */
                    }
                    window.location.href = "/";
                  }}
                >
                  Ignorer cette invitation
                </button>
              )}
              {mode === "invite" && !/^[a-f0-9]{64}$/.test(token) && (
                <p className="hf-error">
                  Ouvrez le lien complet transmis par l’administrateur de votre
                  équipe.
                </p>
              )}
              <Button
                type="submit"
                className="h-12 rounded-lg text-[15px] mt-1"
                disabled={
                  busy ||
                  loading ||
                  !state.configured ||
                  !!connectionError ||
                  (mode === "invite" && !/^[a-f0-9]{64}$/.test(token))
                }
              >
                {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
                {content[mode].action}
                {!busy && <ArrowRight className="size-4" />}
              </Button>
            </form>
          )}
          {mode === "login" && (
            <p className="text-sm text-center hf-muted mt-7">
              Pas encore de compte ?{" "}
              <a href="/signup" className="hf-link">
                Créer mon compte
              </a>
            </p>
          )}
          {mode === "signup" && (
            <p className="text-sm text-center hf-muted mt-7">
              Vous avez déjà un compte ?{" "}
              <a href="/login" className="hf-link">
                Se connecter
              </a>
            </p>
          )}
          <div className="flex items-center justify-center gap-2 mt-9 text-xs text-[#8a9990]">
            <LockKeyhole className="size-3" />
            Un compte personnel, des accès selon votre rôle.
          </div>
        </div>
      </main>
    </div>
  );
}
