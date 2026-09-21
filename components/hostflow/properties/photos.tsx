"use client";
import { useEffect, useRef, useState } from "react";
import {
  ImagePlus,
  Upload,
  Star,
  Trash2,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../shared";
import {
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
  type PropertyDetail,
  type PropertyImage,
} from "@/lib/properties/types";
import { propertyRequest, usePropertyResource } from "./client";
import {
  ConfirmPropertyAction,
  PropertyFailure,
  PropertyPhoto,
  PropertyLoading,
} from "./shared";
export function PropertyPhotos({
  organizationId,
  propertyId,
  editable = false,
  onBusyChange,
}: {
  organizationId: string;
  propertyId: string;
  editable?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const { data, error, reload, refreshing, loading } =
    usePropertyResource<PropertyDetail>("/" + propertyId, organizationId);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    onBusyChange?.(busy);
    return () => onBusyChange?.(false);
  }, [busy, onBusyChange]);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState("");
  const [progress, setProgress] = useState("");
  const [target, setTarget] = useState<PropertyImage | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const images = data?.images ?? [];
  const ready = images.filter((i) => i.state === "ready");
  const disabled = busy || refreshing;
  const canEdit = editable && !!data && data.property.status !== "archived";
  async function upload(files: File[]) {
    if (lock.current || !canEdit || !files.length) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setMessage("");
    const errors: string[] = [];
    let done = 0;
    try {
      if (images.length + files.length > MAX_PHOTOS)
        throw new Error(
          "Un logement peut contenir au maximum 30 photos. Retirez quelques fichiers de votre sélection.",
        );
      for (const [index, file] of files.entries()) {
        setProgress(`Photo ${index + 1} sur ${files.length} : ${file.name}`);
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > MAX_PHOTO_BYTES ||
          !file.size
        ) {
          errors.push(file.name + " : JPEG, PNG ou WebP, 5 Mo maximum.");
          continue;
        }
        try {
          await propertyRequest("/" + propertyId + "/images", organizationId, {
            method: "POST",
            file,
          });
          done++;
        } catch (e) {
          errors.push(
            file.name +
              " : " +
              (e instanceof Error ? e.message : "Envoi interrompu."),
          );
        }
      }
      if (done)
        setMessage(
          `${done} photo${done > 1 ? "s" : ""} ajoutée${done > 1 ? "s" : ""}.`,
        );
      if (errors.length) setFailure(errors.join(" "));
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Envoi interrompu.");
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress("");
      if (input.current) input.current.value = "";
      reload();
    }
  }
  async function arrange(order: string[], cover: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setMessage("");
    try {
      await propertyRequest("/" + propertyId + "/images", organizationId, {
        method: "PATCH",
        body: { order, cover },
      });
      setMessage("Galerie mise à jour.");
      reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Modification impossible.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function move(index: number, direction: number) {
    const order = ready.map((i) => i.id);
    const other = index + direction;
    if (other < 0 || other >= order.length) return;
    [order[index], order[other]] = [order[other], order[index]];
    void arrange(order, ready.find((i) => i.is_cover)?.id ?? order[0]);
  }
  async function remove() {
    if (!target || lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      await propertyRequest(
        "/" + propertyId + "/images/" + target.id,
        organizationId,
        { method: "DELETE" },
      );
      setMessage("Photo supprimée.");
      reload();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "Suppression impossible.");
    } finally {
      setTarget(null);
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Photos du logement</h2>
        <span className="text-sm hf-muted">
          {data
            ? `${ready.length} photo${ready.length !== 1 ? "s" : ""}`
            : "Chargement…"}
        </span>
      </div>
      {canEdit && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!disabled) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!disabled) void upload(Array.from(e.dataTransfer.files));
          }}
          className={
            "rounded-xl border-2 border-dashed px-5 py-7 text-center space-y-3 " +
            (dragging
              ? "border-primary bg-[#eef6f0]"
              : "border-[#dce5df] bg-[#fafcfb]")
          }
        >
          <Upload className="size-6 mx-auto text-[#5c826e]" />
          <p className="text-sm">
            Glissez vos photos ici, ou sélectionnez-les.
          </p>
          <input
            ref={input}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            aria-label="Photos du logement"
            disabled={disabled}
            onChange={(e) => void upload(Array.from(e.target.files ?? []))}
          />
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => input.current?.click()}
          >
            <ImagePlus className="size-4" />
            Choisir des photos
          </Button>
          <p className="text-xs hf-muted">
            JPEG, PNG, WebP · 5 Mo par photo · 30 photos maximum
          </p>
        </div>
      )}
      {progress && (
        <p role="status" className="text-sm flex items-center gap-2 break-all">
          <LoaderCircle className="size-4 animate-spin shrink-0" />
          {progress}
        </p>
      )}
      {failure && (
        <p role="alert" className="hf-error break-words">
          {failure}
        </p>
      )}
      {message && (
        <p role="status" className="hf-success">
          {message}
        </p>
      )}
      {error ? (
        <PropertyFailure error={error} retry={reload} />
      ) : loading && !data ? (
        <PropertyLoading />
      ) : images.length ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {images.map((image) => {
            const index = ready.findIndex((i) => i.id === image.id);
            return (
              <div
                className="rounded-xl border overflow-hidden bg-white"
                key={image.id}
              >
                <div className="relative aspect-[4/3]">
                  {image.state === "ready" ? (
                    <PropertyPhoto
                      org={organizationId}
                      id={propertyId}
                      imageId={image.id}
                      alt={
                        (data?.property.name ?? "Logement") +
                        " — photo " +
                        (index + 1)
                      }
                    />
                  ) : (
                    <div className="h-full flex items-center justify-center bg-[#f0f3f1] text-sm hf-muted p-5 text-center">
                      {image.state === "pending"
                        ? "Envoi interrompu ou en cours"
                        : "Suppression à terminer"}
                    </div>
                  )}
                  {image.is_cover && (
                    <span className="absolute left-3 top-3 rounded-full bg-white px-3 py-1 text-xs font-semibold flex items-center gap-1">
                      <Star className="size-3 text-[#448162]" />
                      Principale
                    </span>
                  )}
                </div>
                {canEdit && (
                  <div className="p-3 space-y-3">
                    {image.state === "ready" && (
                      <Button
                        type="button"
                        variant={image.is_cover ? "secondary" : "outline"}
                        className="w-full"
                        disabled={disabled || image.is_cover}
                        onClick={() =>
                          void arrange(
                            ready.map((i) => i.id),
                            image.id,
                          )
                        }
                      >
                        <Star className="size-4" />
                        {image.is_cover
                          ? "Photo principale"
                          : "Définir comme principale"}
                      </Button>
                    )}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex gap-1">
                        {image.state === "ready" && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={
                                "Déplacer la photo " + (index + 1) + " avant"
                              }
                              disabled={disabled || index === 0}
                              onClick={() => move(index, -1)}
                            >
                              <ArrowLeft />
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              aria-label={
                                "Déplacer la photo " + (index + 1) + " après"
                              }
                              disabled={disabled || index === ready.length - 1}
                              onClick={() => move(index, 1)}
                            >
                              <ArrowRight />
                            </Button>
                          </>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-[#a6544e]"
                        disabled={disabled}
                        onClick={() => setTarget(image)}
                      >
                        <Trash2 className="size-4" />
                        Supprimer
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !busy ? (
        <EmptyState
          icon={ImagePlus}
          title="Aucune photo pour le moment."
          description={
            editable
              ? "Ajoutez des photos pour identifier ce logement et choisissez une image principale."
              : "Les photos ajoutées au logement apparaîtront ici."
          }
        />
      ) : null}
      <ConfirmPropertyAction
        open={!!target}
        onOpenChange={(v) => {
          if (!v) setTarget(null);
        }}
        title="Supprimer cette photo ?"
        description="Le fichier sera supprimé définitivement de ce logement. Cette action ne modifie pas les autres photos."
        busy={busy}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
