"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export function Roadmap({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[90svh] overflow-auto">
        <DialogHeader>
          <DialogTitle>La suite de HostFlow</DialogTitle>
          <DialogDescription>
            Une base solide, puis les modules qui simplifient votre quotidien.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-0 mt-2">
          {[
            [
              "01",
              "Le socle",
              "Comptes, organisations, rôles et équipe.",
              "Disponible",
            ],
            [
              "02",
              "Votre portefeuille",
              "Logements, équipements et photos privées.",
              "Version actuelle",
            ],
            [
              "03",
              "Les séjours",
              "Réservations manuelles et calendrier central.",
              "À venir",
            ],
            [
              "04",
              "Les opérations",
              "Missions, ménages et suivi mobile.",
              "À venir",
            ],
            [
              "05",
              "Les connexions",
              "Synchronisation iCal et détection des conflits.",
              "À venir",
            ],
            [
              "06",
              "La gestion avancée",
              "Finance, portails, automatisations et messages.",
              "À venir",
            ],
          ].map(([n, title, description, status]) => (
            <div key={n} className="flex gap-4 py-4 border-b last:border-0">
              <span className="text-xs text-[#7fa68b] pt-1 font-mono">{n}</span>
              <div className="flex-1">
                <div className="flex flex-wrap justify-between gap-2">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <span className="text-[11px] text-[#839787]">{status}</span>
                </div>
                <p className="text-sm hf-muted mt-1.5">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-[#819186] leading-relaxed">
          Les modules à venir ne sont pas encore actifs. Aucune plateforme de
          réservation n’est connectée.
        </p>
      </DialogContent>
    </Dialog>
  );
}
