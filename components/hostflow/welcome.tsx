"use client";
import { useState } from "react";
import { ArrowRight, Building2, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field } from "./shared";
import { mutate } from "./client";
import { invitationToken } from "@/lib/hostflow/invitations";

export function WelcomeAccount({
  email,
  onError,
}: {
  email: string;
  onError: (message: string) => void;
}) {
  const [invitation, setInvitation] = useState("");
  const [busy, setBusy] = useState(false);
  function join(event: React.FormEvent) {
    event.preventDefault();
    const token = invitationToken(invitation, window.location.origin);
    if (!token) {
      onError(
        "Collez le lien d’invitation HostFlow complet transmis par votre responsable.",
      );
      return;
    }
    window.location.href = "/invite?token=" + encodeURIComponent(token);
  }
  return (
    <div className="space-y-5">
      <p className="text-sm hf-muted break-all">
        Compte personnel : <strong className="text-foreground">{email}</strong>
      </p>
      <section
        className="rounded-xl border bg-white p-5 space-y-4"
        aria-labelledby="join-team-title"
      >
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-[#edf4ef] p-2.5 text-primary">
            <Users className="size-5" />
          </span>
          <h2 id="join-team-title" className="text-lg font-semibold">
            Rejoindre une équipe
          </h2>
        </div>
        <p className="text-sm hf-muted leading-relaxed">
          Vous travaillez avec une conciergerie ? Ouvrez le lien reçu par email
          ou transmis par votre responsable. Aucune organisation à créer.
        </p>
        <form onSubmit={join} className="space-y-3">
          <Field
            id="invitation-link"
            label="Votre lien d’invitation"
            value={invitation}
            onChange={(e) => setInvitation(e.target.value)}
            placeholder="Collez votre lien HostFlow"
            required
            autoComplete="off"
          />
          <Button type="submit" className="w-full h-11" disabled={busy}>
            Rejoindre avec mon invitation <ArrowRight className="size-4" />
          </Button>
        </form>
        <p className="text-xs hf-muted leading-relaxed">
          Pas encore d’invitation ? Demandez à votre responsable de vous inviter
          à l’adresse ci-dessus. Votre compte est prêt et vous pourrez revenir à
          tout moment.
        </p>
      </section>
      <section
        className="rounded-xl border bg-[#f8faf8] p-5 space-y-3"
        aria-labelledby="create-team-title"
      >
        <div className="flex items-center gap-3">
          <Building2 className="size-5 text-[#718279]" />
          <h2 id="create-team-title" className="font-semibold">
            Vous dirigez une conciergerie ?
          </h2>
        </div>
        <p className="text-sm hf-muted leading-relaxed">
          Créez son espace pour configurer votre organisation et inviter votre
          équipe.
        </p>
        <Button asChild variant="outline" className="w-full h-11">
          <a href="/onboarding">
            Créer mon organisation <ArrowRight className="size-4" />
          </a>
        </Button>
      </section>
      <div className="flex items-center justify-between gap-4 text-sm">
        <a href="/settings" className="hf-link">
          Mon profil
        </a>
        <button
          type="button"
          disabled={busy}
          className="flex items-center gap-2 hf-muted hover:text-foreground"
          onClick={async () => {
            setBusy(true);
            try {
              await mutate({ action: "logout" });
              window.location.href = "/login";
            } catch {
              onError("Déconnexion impossible. Réessayez.");
              setBusy(false);
            }
          }}
        >
          <LogOut className="size-4" />
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
