"use client";

// Tableau de bord Formations — hub d'accueil de la rubrique.
// Structure :
//   1. Stats sommaires en haut (4-5 KPI rapides)
//   2. Placeholder "Indicateurs Qualiopi" (à développer ultérieurement)
//   3. Grille de cards d'accès aux sous-sections (Catalogue, Sessions,
//      Formateurs, Paramètres communs, Réclamations)
//
// Les sous-sections (catalogue/sessions/etc.) restent à leurs URLs actuelles
// — seule la landing /admin/formations devient un dashboard.

import { useEffect, useState } from "react";
import Link from "next/link";

interface DashboardStats {
  year: number;
  formationsActives: number;
  sessionsAVenir: number;
  sessionsEnCours: number;
  stagiairesAnnee: number;
  pendingTrainees: number;
  complaints: {
    total: number;
    open: number;
    overdue: number;
    resolutionRate: number;
  };
}

export default function FormationsDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/formations/dashboard-stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold" style={{ color: "#1f2244" }}>
          Formations
        </h1>
        <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
          Tableau de bord {stats?.year ?? new Date().getFullYear()} — vue d&apos;ensemble de l&apos;organisme de formation
        </p>
      </div>

      {/* === Stats KPI === */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
        <StatCard
          label="Formations actives"
          value={loading ? "…" : String(stats?.formationsActives ?? 0)}
          color="#1f2244"
        />
        <StatCard
          label="Sessions à venir (3 mois)"
          value={loading ? "…" : String(stats?.sessionsAVenir ?? 0)}
          color="#3730a3"
        />
        <StatCard
          label="Sessions en cours"
          value={loading ? "…" : String(stats?.sessionsEnCours ?? 0)}
          color="#166534"
        />
        <StatCard
          label={`Stagiaires ${stats?.year ?? ""}`}
          value={loading ? "…" : String(stats?.stagiairesAnnee ?? 0)}
          color="#1f2244"
        />
        <StatCard
          label="Réclamations ouvertes"
          value={loading ? "…" : String(stats?.complaints.open ?? 0)}
          color={stats && stats.complaints.overdue > 0 ? "#991b1b" : "#92400e"}
          hint={
            stats && stats.complaints.overdue > 0
              ? `⚠ ${stats.complaints.overdue} en retard (> 30j)`
              : undefined
          }
        />
      </div>

      {/* Alerte stagiaires bloqués */}
      {stats && stats.pendingTrainees > 0 && (
        <div className="mb-6 p-3 rounded-lg text-sm font-jetbrains" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          ⚠ <strong>{stats.pendingTrainees} stagiaire{stats.pendingTrainees > 1 ? "s" : ""} bloqué{stats.pendingTrainees > 1 ? "s" : ""}</strong>
          {" "}en statut intermédiaire (devis ou convention envoyée) depuis plus de 14 jours.
          {" "}<Link href="/admin/formations/sessions" className="underline">Voir les sessions →</Link>
        </div>
      )}

      {/* === Placeholder Indicateurs Qualiopi === */}
      <div className="mb-8 p-6 rounded-2xl border-2 border-dashed" style={{ borderColor: "#cbd5e1", backgroundColor: "#fafbff" }}>
        <div className="flex items-start gap-4">
          <div className="text-3xl">📊</div>
          <div className="flex-1">
            <h2 className="text-base font-semibold" style={{ color: "#1f2244" }}>
              Indicateurs Qualiopi
              <span className="ml-2 text-xs font-jetbrains px-2 py-0.5 rounded-full" style={{ backgroundColor: "#e0e7ff", color: "#3730a3" }}>
                à venir
              </span>
            </h2>
            <p className="text-sm mt-1 font-jetbrains" style={{ color: "#727485" }}>
              Cet emplacement accueillera prochainement le tableau de bord complet
              pour l&apos;audit Qualiopi : NPS et satisfaction agrégés, taux d&apos;assiduité moyen,
              taux d&apos;atteinte des objectifs, indicateurs par formation et par formateur,
              ainsi que les données pré-calculées pour le BPF.
            </p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs font-jetbrains" style={{ color: "#9ca3af" }}>
              <div>• Satisfaction moyenne (chaud / froid)</div>
              <div>• Taux de réponse aux évaluations</div>
              <div>• NPS global et par formation</div>
              <div>• Taux d&apos;assiduité moyen</div>
              <div>• Atteinte des objectifs pédagogiques</div>
              <div>• Données BPF pré-calculées (annuel)</div>
            </div>
          </div>
        </div>
      </div>

      {/* === Grille d'accès rapide === */}
      <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#727485" }}>
        Gérer
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <AccessCard
          href="/admin/formations/catalogue"
          icon="📚"
          title="Catalogue des formations"
          description="Créer, modifier les formations. Configurer pré-requis, grilles d'évaluation, questionnaires d'évaluation."
        />
        <AccessCard
          href="/admin/formations/sessions"
          icon="📅"
          title="Sessions"
          description="Toutes les sessions de formation, leur statut, et le suivi des stagiaires inscrits."
        />
        <AccessCard
          href="/admin/formations/trainers"
          icon="👤"
          title="Formateurs"
          description="Gérer les formateurs, leurs accès à l'espace formateur (magic links)."
        />
        <AccessCard
          href="/admin/formations/parametres-communs"
          icon="⚙"
          title="Paramètres communs"
          description="Intégration Sellsy · Templates Drive · Questionnaires d'évaluation (chaud / froid / formateur)."
        />
        <AccessCard
          href="/admin/reclamations"
          icon="⚠"
          title="Réclamations"
          description="Suivi des réclamations stagiaires & bénéficiaires (Qualiopi indicateur 32)."
          badge={
            stats && stats.complaints.open > 0
              ? { label: `${stats.complaints.open} ouverte${stats.complaints.open > 1 ? "s" : ""}`, color: stats.complaints.overdue > 0 ? "#991b1b" : "#92400e" }
              : undefined
          }
        />
        <AccessCard
          href="/reclamation"
          icon="🔗"
          title="Formulaire public réclamation"
          description="Lien à diffuser sur ton site web pour permettre aux stagiaires de déposer une réclamation."
          external
        />
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
  hint,
}: {
  label: string;
  value: string;
  color?: string;
  hint?: string;
}) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>{label}</div>
      <div className="text-2xl font-bold mt-1" style={{ color: color || "#1f2244" }}>{value}</div>
      {hint && (
        <div className="text-xs font-jetbrains mt-1" style={{ color: "#991b1b" }}>{hint}</div>
      )}
    </div>
  );
}

function AccessCard({
  href,
  icon,
  title,
  description,
  badge,
  external,
}: {
  href: string;
  icon: string;
  title: string;
  description: string;
  badge?: { label: string; color: string };
  external?: boolean;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-3xl">{icon}</div>
        {badge && (
          <span
            className="text-xs font-jetbrains px-2 py-0.5 rounded-full"
            style={{ backgroundColor: "#fef3c7", color: badge.color }}
          >
            {badge.label}
          </span>
        )}
      </div>
      <h3 className="font-semibold text-base mt-2" style={{ color: "#1f2244" }}>
        {title}
        {external && <span className="ml-1 text-xs" style={{ color: "#9ca3af" }}>↗</span>}
      </h3>
      <p className="text-xs font-jetbrains mt-1" style={{ color: "#727485" }}>
        {description}
      </p>
    </>
  );
  const className = "p-5 rounded-xl border hover:shadow-md transition-shadow cursor-pointer block";
  const style = { borderColor: "#e5e7eb", backgroundColor: "white" };
  return external ? (
    <a href={href} target="_blank" rel="noreferrer" className={className} style={style}>
      {content}
    </a>
  ) : (
    <Link href={href} className={className} style={style}>
      {content}
    </Link>
  );
}
