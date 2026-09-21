"use client";
import Link from "next/link";
import { Building2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
    <span
      className={
        "inline-flex rounded-full px-3 py-1 text-xs font-semibold " +
        {
          active: "bg-[#e5f3eb] text-[#246747]",
          inactive: "bg-[#f4f0e7] text-[#7c6338]",
          archived: "bg-[#eef0f1] text-[#69777a]",
        }[status]
      }
    >
      {statusLabels[status]}
    </span>
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
export function PropertyLoading() {
  return (
    <div
      role="status"
      aria-label="Chargement des logements"
      className="space-y-5"
    >
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-20 w-full" />
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-72" />
        ))}
      </div>
    </div>
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
