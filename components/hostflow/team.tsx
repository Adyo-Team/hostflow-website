"use client";
import { useState } from "react";
import {
  ChevronDown,
  Copy,
  Link2,
  LoaderCircle,
  Mail,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Field, EmptyState, RoleSelect, initials } from "./shared";
import { AccessGate } from "./access-gate";
import {
  roleLabels,
  canReadTeam,
  canManageTeam,
  canManageMember,
  assignableRoles,
  invitationRoles,
  type Role,
  type WorkspaceState,
  type Membership,
} from "@/lib/hostflow/types";
import type { Run } from "./client";
export function Team({
  state,
  active,
  run,
  busy,
}: {
  state: WorkspaceState;
  active?: Membership;
  run: Run;
  busy: boolean;
}) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [inviteUrl, setInviteUrl] = useState("");
  const [edit, setEdit] = useState<Membership | null>(null);
  const [editRole, setEditRole] = useState<Role>("staff");
  const [remove, setRemove] = useState<Membership | null>(null);
  const [confirm, setConfirm] = useState<Membership | null>(null);
  return (
    <>
      <div className="flex flex-wrap justify-between gap-4 items-center mb-7">
        <div>
          <div className="hf-overline mb-3">Travailler ensemble</div>
          <h1 className="hf-heading">Votre équipe</h1>
          <p className="hf-subtitle">
            Les bonnes personnes, avec les bons accès.
          </p>
        </div>
        {canManageTeam(active?.role) && (
          <Button
            onClick={() => {
              setInviteUrl("");
              setEmail("");
              setRole("staff");
              setInviteOpen(true);
            }}
            className="h-11 rounded-lg"
          >
            <Plus />
            Inviter un membre
          </Button>
        )}
      </div>
      {active &&
        canManageTeam(active.role) &&
        !active.organization?.team_setup_completed_at && (
          <div className="hf-panel p-5 mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold">
                3. Constituer votre équipe
              </p>
              <p className="text-sm hf-muted mt-1">
                Invitez un collaborateur ou commencez seul. Vous pourrez inviter
                votre équipe plus tard.
              </p>
            </div>
            <Button
              variant="outline"
              disabled={busy}
              onClick={async () => {
                const result = await run({
                  action: "completeTeamSetup",
                  organizationId: active.organization_id,
                });
                if (result) window.location.href = "/";
              }}
            >
              Continuer sans invitation
            </Button>
          </div>
        )}
      <AccessGate state={state} active={active}>
        {active && !canReadTeam(active.role) ? (
          <div className="hf-panel">
            <EmptyState
              icon={ShieldCheck}
              title="Accès réservé"
              description="Seuls les administrateurs et les managers peuvent consulter l’équipe."
            />
          </div>
        ) : (
          <>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              {[
                [
                  "Membres actifs",
                  state.members.filter((m) => m.status === "active").length,
                ],
                [
                  "Administrateurs",
                  state.members.filter(
                    (m) => canManageTeam(m.role) && m.status === "active",
                  ).length,
                ],
                [
                  "Invitations en attente",
                  state.invitations.filter(
                    (i) => new Date(i.expires_at) > new Date(),
                  ).length,
                ],
              ].map(([label, value]) => (
                <div className="hf-panel p-5" key={label}>
                  <p className="text-sm hf-muted">{label}</p>
                  <p className="text-3xl font-semibold mt-3">
                    {label === "Invitations en attente" &&
                    !canManageTeam(active?.role)
                      ? "—"
                      : value}
                  </p>
                </div>
              ))}
            </div>
            <div className="hf-panel overflow-hidden">
              <div className="hf-panel-header border-b">
                <h2 className="hf-panel-title">Membres de l’organisation</h2>
                <span className="hf-tag">
                  {state.members.length} membre
                  {state.members.length > 1 ? "s" : ""}
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Membre</TableHead>
                    <TableHead>Rôle</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right pr-6">Accès</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.members.map((member) => (
                    <TableRow key={member.id}>
                      <TableCell className="pl-6 py-5">
                        <span className="flex items-center gap-3">
                          <span className="hf-avatar">
                            {initials(member.display_name)}
                          </span>
                          <span className="font-medium whitespace-nowrap">
                            {member.display_name}
                            {member.user_id === state.user?.id && (
                              <span className="text-xs text-[#859387] font-normal ml-2">
                                Vous
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="block text-sm hf-muted mt-1 break-all">
                          {member.email}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {roleLabels[member.role]}
                      </TableCell>
                      <TableCell>
                        <span
                          className={
                            "hf-tag " +
                            (member.status === "active"
                              ? "text-[#287852] bg-[#eff8f2] border-[#d8ebde]"
                              : "text-[#956835]")
                          }
                        >
                          {member.status === "active" ? "Actif" : "Suspendu"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right pr-5">
                        {canManageMember(active, member) ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" disabled={busy}>
                                Gérer
                                <ChevronDown className="size-3" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onSelect={() => {
                                  setEdit(member);
                                  setEditRole(
                                    assignableRoles(active?.role).includes(
                                      member.role as Role,
                                    )
                                      ? (member.role as Role)
                                      : "staff",
                                  );
                                }}
                              >
                                Modifier le rôle
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setConfirm(member)}
                              >
                                {member.status === "active"
                                  ? "Suspendre l’accès"
                                  : "Réactiver l’accès"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onSelect={() => setRemove(member)}
                              >
                                Retirer de l’organisation
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs hf-muted">
                            Lecture seule
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {canManageTeam(active?.role) && (
              <div className="hf-panel mt-6">
                <div className="hf-panel-header border-b">
                  <h2 className="hf-panel-title">Invitations</h2>
                  <Mail className="size-4 hf-muted" />
                </div>
                {state.invitations.length ? (
                  <div className="px-6">
                    {state.invitations.map((invitation) => (
                      <div
                        className="flex flex-wrap justify-between gap-3 items-center py-4 border-b last:border-0"
                        key={invitation.id}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium break-all">
                            {invitation.email}
                          </p>
                          <p className="text-xs hf-muted mt-1">
                            {roleLabels[invitation.role]} ·{" "}
                            {new Date(invitation.expires_at) > new Date()
                              ? "Expire le "
                              : "Expirée le "}
                            {new Date(invitation.expires_at).toLocaleDateString(
                              "fr-FR",
                            )}
                          </p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={
                            busy ||
                            (active?.role === "admin" &&
                              !["manager", "staff"].includes(invitation.role))
                          }
                          onClick={() =>
                            void run(
                              {
                                action: "revokeInvitation",
                                organizationId: active!.organization_id,
                                invitationId: invitation.id,
                              },
                              "Invitation révoquée.",
                            )
                          }
                        >
                          Révoquer
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={Mail}
                    title="Aucune invitation en attente"
                    description="Créez un lien personnel pour inviter votre prochain collaborateur."
                  />
                )}
              </div>
            )}
          </>
        )}
      </AccessGate>
      <AlertDialog
        open={!!remove}
        onOpenChange={(v) => {
          if (!v) setRemove(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer ce membre ?</AlertDialogTitle>
            <AlertDialogDescription>
              {remove?.display_name} perdra l’accès à cette organisation. Son
              compte personnel est conservé. Une nouvelle invitation sera
              nécessaire pour revenir.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (remove && active) {
                  const result = await run(
                    {
                      action: "removeMember",
                      organizationId: active.organization_id,
                      membershipId: remove.id,
                    },
                    "Membre retiré.",
                  );
                  if (result) setRemove(null);
                }
              }}
            >
              Retirer le membre
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>
              {inviteUrl ? "Votre invitation est prête" : "Inviter un membre"}
            </DialogTitle>
            <DialogDescription>
              {inviteUrl
                ? "Ce lien expire dans 7 jours et ne fonctionne que pour l’adresse indiquée."
                : "Choisissez son rôle. Vous pourrez ensuite lui transmettre son lien personnel."}
            </DialogDescription>
          </DialogHeader>
          {inviteUrl ? (
            <div className="space-y-5">
              <div className="hf-success">Invitation créée pour {email}.</div>
              <Field
                label="Lien personnel"
                id="invitation-link"
                value={inviteUrl}
                readOnly
              />
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(inviteUrl);
                    toast.success("Lien copié.");
                  } catch {
                    toast.error("Sélectionnez et copiez le lien manuellement.");
                  }
                }}
              >
                <Copy />
                Copier le lien
              </Button>
              <p className="text-xs hf-muted">
                Le lien ne sera plus affiché après la fermeture. Aucun email n’a
                été envoyé.
              </p>
            </div>
          ) : (
            <form
              className="hf-form mt-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!active) return;
                const result = await run({
                  action: "createInvitation",
                  organizationId: active!.organization_id,
                  email,
                  role: role as "admin" | "manager" | "staff",
                });
                if (result?.invitationUrl) setInviteUrl(result.invitationUrl);
              }}
            >
              <Field
                id="invite-email"
                label="Email du collaborateur"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="prenom@conciergerie.fr"
              />
              <div className="hf-field">
                <label>Rôle dans cette organisation</label>
                <RoleSelect
                  value={role}
                  onChange={setRole}
                  options={invitationRoles(active?.role)}
                />
              </div>
              <Button type="submit" disabled={busy} className="h-11">
                {busy ? <LoaderCircle className="animate-spin" /> : <Link2 />}
                Créer le lien d’invitation
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!edit}
        onOpenChange={(v) => {
          if (!v) setEdit(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Modifier le rôle</DialogTitle>
            <DialogDescription>
              Les permissions de {edit?.display_name} seront mises à jour
              immédiatement.
            </DialogDescription>
          </DialogHeader>
          <RoleSelect
            value={editRole}
            onChange={setEditRole}
            options={assignableRoles(active?.role)}
          />
          <Button
            disabled={busy}
            onClick={async () => {
              if (edit && active) {
                const result = await run(
                  {
                    action: "updateMembership",
                    organizationId: active!.organization_id,
                    membershipId: edit.id,
                    role: editRole,
                    status: edit.status,
                  },
                  "Rôle mis à jour.",
                );
                if (result) setEdit(null);
              }
            }}
          >
            Enregistrer le rôle
          </Button>
        </DialogContent>
      </Dialog>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(v) => {
          if (!v) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.status === "active"
                ? "Suspendre cet accès ?"
                : "Réactiver cet accès ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.display_name}{" "}
              {confirm?.status === "active"
                ? "ne pourra plus accéder à cette organisation. Ses données seront conservées."
                : "retrouvera les permissions de son rôle dans cette organisation."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (confirm && active) {
                  const result = await run(
                    {
                      action: "updateMembership",
                      organizationId: active!.organization_id,
                      membershipId: confirm.id,
                      role: confirm.role as Role,
                      status:
                        confirm.status === "active" ? "suspended" : "active",
                    },
                    "Accès mis à jour.",
                  );
                  if (result) setConfirm(null);
                }
              }}
            >
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
