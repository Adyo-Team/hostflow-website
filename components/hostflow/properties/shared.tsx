"use client";
import Link from "next/link";
import { Building2 } from "lucide-react";
import Image from "next/image";
import { Button, StatusBadge, PageLoading } from "@/components/hostflow/ui";
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
import {
  statusLabels,
  photoUrl,
  type PropertyStatus,
} from "@/lib/properties/types";
export function PropertyStatusBadge({ status }: { status: PropertyStatus }) {
  return (
    <StatusBadge
      tone={
        status === "active"
          ? "success"
          : status === "inactive"
            ? "warning"
            : "neutral"
      }
    >
      {statusLabels[status]}
    </StatusBadge>
  );
}
export function PropertyPhoto({
  org,
  id,
  imageId,
  alt,
  priority = false,
}: {
  org: string;
  id: string;
  imageId: string | null;
  alt: string;
  priority?: boolean;
}) {
  return imageId ? (
    <Image
      src={photoUrl(org, id, imageId)}
      alt={alt}
      fill
      unoptimized
      priority={priority}
      className="object-cover"
      sizes="(max-width: 768px) 100vw, 400px"
    />
  ) : (
    <div className="h-full min-h-36 grid place-items-center bg-[#edf2ef] text-[#81958a]">
      <Building2 className="size-10" strokeWidth={1.3} />
      <span className="sr-only">Aucune photo</span>
    </div>
  );
}
export function PropertyLoading({
  variant = "list",
  header = true,
}: {
  variant?: "list" | "detail" | "form";
  header?: boolean;
}) {
  return (
    <PageLoading
      label="Chargement des logements"
      variant={variant}
      header={header}
    />
  );
}
export function PropertyFailure({
  error,
  retry,
}: {
  error: string;
  retry: () => void;
}) {
  return (
    <div
      role="alert"
      className="hf-error flex flex-wrap gap-4 items-center justify-between"
    >
      <p>{error}</p>
      <Button variant="outline" onClick={retry}>
        Réessayer
      </Button>
      <Link prefetch={false} href="/properties" className="hf-link">
        Retour aux logements
      </Link>
    </div>
  );
}
export function ConfirmPropertyAction({
  open,
  onOpenChange,
  title,
  description,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  busy: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog
      open={open}
      onOpenChange={(v) => {
        if (!busy) onOpenChange(v);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            {busy ? "En cours…" : "Confirmer"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
