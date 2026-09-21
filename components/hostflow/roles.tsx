"use client";
import { ShieldCheck, Users, UserRound } from "lucide-react";
export function Roles() {
  const data: [string, string, string, string][] = [
    [
      "Owner",
      "Organisation",
      "Contrôle total",
      "Organisation, équipe, invitations et historique. Seul l’owner peut nommer ou modifier des admins et d’autres owners. Le dernier owner actif est protégé.",
    ],
    [
      "Administrateur",
      "Organisation",
      "Administration",
      "Paramètres, historique et gestion des managers et prestataires. Aucun changement des accès owner ou admin.",
    ],
    [
      "Manager",
      "Organisation",
      "Pilotage opérationnel",
      "Organisation et équipe en lecture, profil personnel. Les outils opérationnels seront ajoutés avec les prochains modules.",
    ],
    [
      "Équipe / Prestataire",
      "Accès personnel",
      "Accès limité",
      "Informations de l’organisation et profil personnel. Aucun accès à l’annuaire complet ou aux invitations. Missions assignées à venir.",
    ],
    [
      "Propriétaire de logement",
      "À venir",
      "Portail propriétaire",
      "Rôle réservé. Il sera activé avec les logements et les permissions sur les biens détenus.",
    ],
    [
      "Voyageur",
      "À venir",
      "Portail voyageur",
      "Rôle réservé. Il sera activé avec les séjours et leurs accès dédiés.",
    ],
  ];
  return (
    <>
      <div className="mb-7">
        <div className="hf-overline mb-3">Sécurité et collaboration</div>
        <h1 className="hf-heading">Rôles et accès</h1>
        <p className="hf-subtitle">
          Un rôle s’applique à une organisation. Les accès restent séparés.
        </p>
      </div>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
        {data.map(([name, scope, level, description], i) => (
          <section className="hf-panel p-6" key={name}>
            <div className="flex justify-between items-center mb-5">
              <span className="hf-icon-box">
                {i < 2 ? (
                  <ShieldCheck className="size-5" />
                ) : i === 2 ? (
                  <Users className="size-5" />
                ) : (
                  <UserRound className="size-5" />
                )}
              </span>
              <span className="hf-tag">{scope}</span>
            </div>
            <h2 className="font-semibold text-lg tracking-tight">{name}</h2>
            <p className="text-xs text-[#6c8b76] mt-2 font-semibold uppercase tracking-wide">
              {level}
            </p>
            <p className="text-sm hf-muted leading-relaxed mt-4">
              {description}
            </p>
          </section>
        ))}
      </div>
      <div className="hf-panel p-6 mt-6 flex gap-4 items-start">
        <ShieldCheck className="size-5 text-primary shrink-0" />
        <div>
          <h2 className="font-semibold text-sm">
            Des droits vérifiés pour chaque action
          </h2>
          <p className="text-sm hf-muted mt-2 leading-relaxed">
            Un rôle ne donne jamais accès à une autre organisation. Les droits
            des propriétaires, voyageurs et prestataires resteront limités à
            leurs ressources quand les modules correspondants seront activés.
          </p>
        </div>
      </div>
    </>
  );
}
