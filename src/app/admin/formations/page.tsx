"use client";

// Tableau de bord Formations — hub d'accueil de la rubrique.
// Structure :
//   1. Stats sommaires en haut (4-5 KPI rapides annuels — endpoint
//      /api/admin/formations/dashboard-stats)
//   2. Indicateurs Qualiopi annuels (activité, satisfaction chaud/froid,
//      pédagogie, formateurs, réclamations) avec sélecteur d'année et codes
//      couleur selon seuils — endpoint /api/admin/formations/qualiopi-stats
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

interface QualiopiActivity {
  year: number;
  sessionsCount: number;
  formationsDistinctesCount: number;
  traineesAccueillis: number;
  heuresStagiairesRealisees: number;
  heuresStagiairesNominales: number;
  tauxAssiduiteMoyen: number;
  stagiairesPSH: number;
}
interface QualiopiSatisfaction {
  invitedTotal: number;
  submittedTotal: number;
  responseRate: number;
  npsScore: number | null;
  npsPromoters: number;
  npsPassives: number;
  npsDetractors: number;
  npsTotal: number;
  globalAverage: number | null;
  globalCount: number;
}
interface QualiopiPedagogy {
  year: number;
  traineesTotal: number;
  atteints: number;
  partiellementAtteints: number;
  nonAtteints: number;
  nonEvalues: number;
  tauxAtteinte: number;
}
interface QualiopiTrainer {
  invitedTotal: number;
  submittedTotal: number;
  responseRate: number;
  globalAverage: number | null;
  globalCount: number;
}
interface QualiopiComplaints {
  year: number;
  total: number;
  resolved: number;
  unresolved: number;
  resolutionRate: number;
  averageResolutionDays: number;
  overdue: number;
}
interface QualiopiStats {
  year: number;
  availableYears: number[];
  activity: QualiopiActivity;
  satisfactionChaud: QualiopiSatisfaction;
  satisfactionFroid: QualiopiSatisfaction;
  pedagogy: QualiopiPedagogy;
  trainerSat: QualiopiTrainer;
  complaints: QualiopiComplaints;
}

export default function FormationsDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [qualiopi, setQualiopi] = useState<QualiopiStats | null>(null);
  const [qualiopiLoading, setQualiopiLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/formations/dashboard-stats")
      .then((r) => r.json())
      .then((d) => setStats(d))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setQualiopiLoading(true);
    fetch(`/api/admin/formations/qualiopi-stats?year=${selectedYear}`)
      .then((r) => r.json())
      .then((d) => setQualiopi(d))
      .catch(() => setQualiopi(null))
      .finally(() => setQualiopiLoading(false));
  }, [selectedYear]);

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

      {/* === Indicateurs Qualiopi === */}
      <QualiopiDashboard
        stats={qualiopi}
        loading={qualiopiLoading}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        currentYear={currentYear}
      />

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

// ============================================================================
// QualiopiDashboard — bloc d'indicateurs annuels
// ============================================================================

function QualiopiDashboard({
  stats,
  loading,
  selectedYear,
  onYearChange,
  currentYear,
}: {
  stats: QualiopiStats | null;
  loading: boolean;
  selectedYear: number;
  onYearChange: (y: number) => void;
  currentYear: number;
}) {
  const yearOptions = stats?.availableYears ?? [currentYear];

  return (
    <div className="mb-8 p-6 rounded-2xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "#1f2244" }}>
            📊 Indicateurs Qualiopi
          </h2>
          <p className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
            Bilan annuel — sessions terminées dans l&apos;année {selectedYear}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs font-jetbrains" style={{ color: "#727485" }}>Année :</label>
          <select
            value={selectedYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="text-sm font-jetbrains px-3 py-1.5 rounded-lg border"
            style={{ borderColor: "#e5e7eb", backgroundColor: "white", color: "#1f2244" }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && (
        <div className="text-sm font-jetbrains" style={{ color: "#9ca3af" }}>Chargement des indicateurs…</div>
      )}

      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Activité */}
          <QualiopiBlock title="Activité" icon="🏛">
            <QualiopiRow label="Sessions réalisées" value={String(stats.activity.sessionsCount)} />
            <QualiopiRow label="Formations distinctes" value={String(stats.activity.formationsDistinctesCount)} />
            <QualiopiRow label="Stagiaires accueillis" value={String(stats.activity.traineesAccueillis)} />
            <QualiopiRow
              label="Heures-stagiaires réalisées"
              value={`${stats.activity.heuresStagiairesRealisees} h`}
              hint={`/ ${stats.activity.heuresStagiairesNominales} h nominales`}
            />
            <QualiopiRow
              label="Taux d'assiduité moyen"
              value={`${stats.activity.tauxAssiduiteMoyen} %`}
              color={tauxAssiduiteColor(stats.activity.tauxAssiduiteMoyen)}
            />
            <QualiopiRow
              label="Stagiaires en situation de handicap"
              value={String(stats.activity.stagiairesPSH)}
            />
          </QualiopiBlock>

          {/* Pédagogie */}
          <QualiopiBlock title="Atteinte des objectifs pédagogiques" icon="🎯">
            <QualiopiRow
              label="Taux d'atteinte (évalués)"
              value={`${stats.pedagogy.tauxAtteinte} %`}
              color={tauxAtteinteColor(stats.pedagogy.tauxAtteinte)}
            />
            <QualiopiRow label="Atteints" value={String(stats.pedagogy.atteints)} />
            <QualiopiRow label="Partiellement atteints" value={String(stats.pedagogy.partiellementAtteints)} />
            <QualiopiRow label="Non atteints" value={String(stats.pedagogy.nonAtteints)} />
            <QualiopiRow
              label="Non évalués"
              value={String(stats.pedagogy.nonEvalues)}
              hint={stats.pedagogy.nonEvalues > 0 ? "à compléter pour fiabiliser" : undefined}
              color={stats.pedagogy.nonEvalues > 0 ? "#92400e" : undefined}
            />
          </QualiopiBlock>

          {/* Satisfaction à chaud */}
          <QualiopiBlock title="Satisfaction à chaud" icon="🔥">
            <QualiopiRow
              label="Taux de réponse"
              value={formatRate(stats.satisfactionChaud.responseRate)}
              hint={`${stats.satisfactionChaud.submittedTotal} / ${stats.satisfactionChaud.invitedTotal}`}
              color={tauxReponseColor(stats.satisfactionChaud.responseRate)}
            />
            <QualiopiRow
              label="Satisfaction moyenne"
              value={stats.satisfactionChaud.globalAverage !== null
                ? `${stats.satisfactionChaud.globalAverage} / 5`
                : "—"}
              hint={stats.satisfactionChaud.globalCount > 0 ? `sur ${stats.satisfactionChaud.globalCount} réponses` : undefined}
              color={satisfactionColor(stats.satisfactionChaud.globalAverage, 5)}
            />
            <QualiopiRow
              label="NPS"
              value={stats.satisfactionChaud.npsScore !== null ? String(stats.satisfactionChaud.npsScore) : "—"}
              hint={stats.satisfactionChaud.npsTotal > 0
                ? `${stats.satisfactionChaud.npsPromoters}P / ${stats.satisfactionChaud.npsPassives}P / ${stats.satisfactionChaud.npsDetractors}D`
                : undefined}
              color={npsColor(stats.satisfactionChaud.npsScore)}
            />
          </QualiopiBlock>

          {/* Satisfaction à froid */}
          <QualiopiBlock title="Satisfaction à froid (impact 3 mois)" icon="❄">
            <QualiopiRow
              label="Taux de réponse"
              value={formatRate(stats.satisfactionFroid.responseRate)}
              hint={`${stats.satisfactionFroid.submittedTotal} / ${stats.satisfactionFroid.invitedTotal}`}
              color={tauxReponseColor(stats.satisfactionFroid.responseRate)}
            />
            <QualiopiRow
              label="Impact moyen"
              value={stats.satisfactionFroid.globalAverage !== null
                ? `${stats.satisfactionFroid.globalAverage} / 5`
                : "—"}
              hint={stats.satisfactionFroid.globalCount > 0 ? `sur ${stats.satisfactionFroid.globalCount} réponses` : undefined}
              color={satisfactionColor(stats.satisfactionFroid.globalAverage, 5)}
            />
            <QualiopiRow
              label="NPS à froid"
              value={stats.satisfactionFroid.npsScore !== null ? String(stats.satisfactionFroid.npsScore) : "—"}
              hint={stats.satisfactionFroid.npsTotal > 0
                ? `${stats.satisfactionFroid.npsPromoters}P / ${stats.satisfactionFroid.npsPassives}P / ${stats.satisfactionFroid.npsDetractors}D`
                : undefined}
              color={npsColor(stats.satisfactionFroid.npsScore)}
            />
          </QualiopiBlock>

          {/* Satisfaction formateurs */}
          <QualiopiBlock title="Satisfaction formateurs" icon="👤">
            <QualiopiRow
              label="Taux de réponse"
              value={formatRate(stats.trainerSat.responseRate)}
              hint={`${stats.trainerSat.submittedTotal} / ${stats.trainerSat.invitedTotal}`}
              color={tauxReponseColor(stats.trainerSat.responseRate)}
            />
            <QualiopiRow
              label="Note moyenne formateurs"
              value={stats.trainerSat.globalAverage !== null
                ? `${stats.trainerSat.globalAverage} / 4`
                : "—"}
              hint={stats.trainerSat.globalCount > 0 ? `sur ${stats.trainerSat.globalCount} réponses` : undefined}
              color={satisfactionColor(stats.trainerSat.globalAverage, 4)}
            />
          </QualiopiBlock>

          {/* Réclamations */}
          <QualiopiBlock title="Réclamations (indicateur 32)" icon="⚠">
            <QualiopiRow label="Total" value={String(stats.complaints.total)} />
            <QualiopiRow
              label="Résolues"
              value={String(stats.complaints.resolved)}
              hint={stats.complaints.total > 0 ? formatRate(stats.complaints.resolutionRate) : undefined}
            />
            <QualiopiRow
              label="En cours"
              value={String(stats.complaints.unresolved)}
              color={stats.complaints.unresolved > 0 ? "#92400e" : undefined}
            />
            <QualiopiRow
              label="En retard (> 30 j)"
              value={String(stats.complaints.overdue)}
              color={stats.complaints.overdue > 0 ? "#991b1b" : "#166534"}
            />
            <QualiopiRow
              label="Délai moyen de résolution"
              value={stats.complaints.averageResolutionDays > 0
                ? `${stats.complaints.averageResolutionDays} j`
                : "—"}
            />
          </QualiopiBlock>
        </div>
      )}

      {!loading && !stats && (
        <div className="text-sm font-jetbrains" style={{ color: "#991b1b" }}>
          Impossible de charger les indicateurs.
        </div>
      )}
    </div>
  );
}

function QualiopiBlock({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}>
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: "#1f2244" }}>
        <span>{icon}</span>
        <span>{title}</span>
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function QualiopiRow({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm font-jetbrains">
      <div style={{ color: "#727485" }}>{label}</div>
      <div className="text-right">
        <div className="font-semibold" style={{ color: color || "#1f2244" }}>{value}</div>
        {hint && <div className="text-[10px]" style={{ color: "#9ca3af" }}>{hint}</div>}
      </div>
    </div>
  );
}

// === Helpers couleur (codes Qualiopi : vert/orange/rouge selon seuils) ===

function formatRate(r: number): string {
  return `${Math.round(r * 100)} %`;
}

function tauxAssiduiteColor(t: number): string {
  if (t >= 90) return "#166534";
  if (t >= 75) return "#92400e";
  return "#991b1b";
}

function tauxAtteinteColor(t: number): string {
  if (t >= 80) return "#166534";
  if (t >= 60) return "#92400e";
  return "#991b1b";
}

function tauxReponseColor(r: number): string {
  if (r >= 0.6) return "#166534";
  if (r >= 0.3) return "#92400e";
  return "#991b1b";
}

function satisfactionColor(avg: number | null, max: number): string | undefined {
  if (avg === null) return undefined;
  const ratio = avg / max;
  if (ratio >= 0.8) return "#166534";
  if (ratio >= 0.6) return "#92400e";
  return "#991b1b";
}

function npsColor(score: number | null): string | undefined {
  if (score === null) return undefined;
  if (score >= 30) return "#166534";
  if (score >= 0) return "#92400e";
  return "#991b1b";
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
