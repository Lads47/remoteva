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
import { apiFetch, isAbortError } from "@/lib/api-client";

interface DashboardStats {
  year: number;
  formationsActives: number;
  sessionsAVenir: number;
  sessionsEnCours: number;
  stagiairesAnnee: number;
  pendingTrainees: number;
  nonEvalues: number;
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
  byStatus: { new: number; in_progress: number; resolved: number; closed: number };
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

interface QualiopiSheetInfo {
  spreadsheetId: string | null;
  spreadsheetUrl: string | null;
  lastSync: string | null;
}

// Même shape que QualiopiSheetInfo mais alias pour clarté
type BpfSheetInfo = QualiopiSheetInfo;

interface QualiopiLinks {
  veille: string;
  partenaires: string;
}

export default function FormationsDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [qualiopi, setQualiopi] = useState<QualiopiStats | null>(null);
  const [qualiopiLoading, setQualiopiLoading] = useState(true);
  const [sheetInfo, setSheetInfo] = useState<QualiopiSheetInfo | null>(null);
  const [bpfSheetInfo, setBpfSheetInfo] = useState<BpfSheetInfo | null>(null);
  const [qualiopiLinks, setQualiopiLinks] = useState<QualiopiLinks | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<DashboardStats>("/api/admin/formations/dashboard-stats", { signal: ac.signal })
      .then((d) => setStats(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setStats(null);
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  useEffect(() => {
    const ac = new AbortController();
    setQualiopiLoading(true);
    apiFetch<QualiopiStats>(`/api/admin/formations/qualiopi-stats?year=${selectedYear}`, { signal: ac.signal })
      .then((d) => setQualiopi(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setQualiopi(null);
      })
      .finally(() => setQualiopiLoading(false));
    return () => ac.abort();
  }, [selectedYear]);

  useEffect(() => {
    const ac = new AbortController();
    apiFetch<QualiopiSheetInfo>("/api/admin/formations/qualiopi-sheet-info", { signal: ac.signal })
      .then((d) => setSheetInfo(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setSheetInfo(null);
      });
    apiFetch<BpfSheetInfo>("/api/admin/formations/bpf-sheet-info", { signal: ac.signal })
      .then((d) => setBpfSheetInfo(d))
      .catch((err) => {
        if (isAbortError(err)) return;
        setBpfSheetInfo(null);
      });
    apiFetch<{ veille?: string; partenaires?: string }>("/api/admin/qualiopi-links", { signal: ac.signal })
      .then((d) => setQualiopiLinks({ veille: d.veille ?? "", partenaires: d.partenaires ?? "" }))
      .catch((err) => {
        if (isAbortError(err)) return;
        setQualiopiLinks(null);
      });
    return () => ac.abort();
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
        <div className="mb-3 p-3 rounded-lg text-sm font-jetbrains" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
          ⚠ <strong>{stats.pendingTrainees} stagiaire{stats.pendingTrainees > 1 ? "s" : ""} bloqué{stats.pendingTrainees > 1 ? "s" : ""}</strong>
          {" "}en statut intermédiaire (devis ou convention envoyée) depuis plus de 14 jours.
          {" "}<Link href="/admin/formations/sessions" className="underline">Voir les sessions →</Link>
          {" "}<span style={{ color: "#92400e", opacity: 0.6 }}>· relance auto quotidienne activée (max 2)</span>
        </div>
      )}

      {/* Alerte stagiaires terminés non évalués */}
      {stats && stats.nonEvalues > 0 && (
        <div className="mb-6 p-3 rounded-lg text-sm font-jetbrains" style={{ backgroundColor: "#fef2f2", color: "#991b1b" }}>
          ⚠ <strong>{stats.nonEvalues} stagiaire{stats.nonEvalues > 1 ? "s" : ""} terminé{stats.nonEvalues > 1 ? "s" : ""} non évalué{stats.nonEvalues > 1 ? "s" : ""}</strong>
          {" "}— à compléter pour fiabiliser le bilan Qualiopi (ind. 6 et 11).
          {" "}<Link href="/admin/formations/non-evalues" className="underline">Voir la liste →</Link>
        </div>
      )}

      {/* === Grille d'accès rapide (visible dès le scroll initial) === */}
      <h2 className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: "#727485" }}>
        Gérer
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
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
          href="/admin/formations/finances"
          icon="💶"
          title="Finances par session"
          description="CA HT, coûts de sous-traitance et marge brute par session. Vue YTD + détail."
        />
      </div>

      {/* === Indicateurs Qualiopi (pliable, replié par défaut) === */}
      <QualiopiDashboard
        stats={qualiopi}
        loading={qualiopiLoading}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        currentYear={currentYear}
        sheetInfo={sheetInfo}
        bpfSheetInfo={bpfSheetInfo}
        qualiopiLinks={qualiopiLinks}
      />
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
  sheetInfo,
  bpfSheetInfo,
  qualiopiLinks,
}: {
  stats: QualiopiStats | null;
  loading: boolean;
  selectedYear: number;
  onYearChange: (y: number) => void;
  currentYear: number;
  sheetInfo: QualiopiSheetInfo | null;
  bpfSheetInfo: BpfSheetInfo | null;
  qualiopiLinks: QualiopiLinks | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const yearOptions = stats?.availableYears ?? [currentYear];

  // Mini-résumé visible quand replié — donne envie de cliquer si une métrique
  // sort des clous, sinon reste discret.
  const summaryChips = stats
    ? [
        {
          label: `${stats.activity.tauxAssiduiteMoyen} % assiduité`,
          color: tauxAssiduiteColor(stats.activity.tauxAssiduiteMoyen),
        },
        stats.satisfactionChaud.globalAverage !== null
          ? {
              label: `${stats.satisfactionChaud.globalAverage}/5 satisfaction`,
              color: satisfactionColor(stats.satisfactionChaud.globalAverage, 5) ?? "#727485",
            }
          : null,
        stats.satisfactionChaud.npsScore !== null
          ? {
              label: `NPS ${stats.satisfactionChaud.npsScore > 0 ? "+" : ""}${stats.satisfactionChaud.npsScore}`,
              color: npsColor(stats.satisfactionChaud.npsScore) ?? "#727485",
            }
          : null,
        {
          label: `${stats.pedagogy.tauxAtteinte} % objectifs atteints`,
          color: tauxAtteinteColor(stats.pedagogy.tauxAtteinte),
        },
        stats.complaints.total > 0
          ? {
              label: `${stats.complaints.total} réclamation${stats.complaints.total > 1 ? "s" : ""}`,
              color: stats.complaints.overdue > 0 ? "#991b1b" : "#727485",
            }
          : null,
      ].filter((x): x is { label: string; color: string } => x !== null)
    : [];

  return (
    <div className="mb-8 rounded-2xl border" style={{ borderColor: "#e5e7eb", backgroundColor: "white" }}>
      {/* En-tête cliquable pour déplier */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-5 flex items-center justify-between gap-3 flex-wrap text-left hover:bg-gray-50 transition-colors rounded-2xl"
      >
        <div className="flex items-center gap-3 flex-wrap min-w-0">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2" style={{ color: "#1f2244" }}>
              <span>📊</span>
              <span>Indicateurs Qualiopi</span>
              <span className="text-xs font-jetbrains font-normal" style={{ color: "#9ca3af" }}>
                {selectedYear}
              </span>
            </h2>
            {!loading && !expanded && stats && summaryChips.length > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {summaryChips.map((chip, i) => (
                  <span
                    key={i}
                    className="text-[11px] font-jetbrains px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#f3f4f6", color: chip.color }}
                  >
                    {chip.label}
                  </span>
                ))}
              </div>
            )}
            {expanded && (
              <p className="text-xs font-jetbrains mt-0.5" style={{ color: "#727485" }}>
                Bilan annuel — sessions terminées dans l&apos;année {selectedYear}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {expanded && (
            <div
              className="flex items-center gap-2"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              role="presentation"
            >
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
              <a
                href={`/api/admin/formations/qualiopi-stats/pdf?year=${selectedYear}`}
                className="text-xs font-jetbrains px-3 py-1.5 rounded-lg border cursor-pointer"
                style={{ borderColor: "#1f2244", color: "#1f2244", backgroundColor: "white" }}
                title="Télécharger un PDF du bilan annuel pour audit Qualiopi"
                target="_blank"
                rel="noreferrer"
              >
                📄 PDF
              </a>
              <a
                href={`/api/admin/audit/zip?year=${selectedYear}`}
                className="text-xs font-jetbrains px-3 py-1.5 rounded-lg cursor-pointer"
                style={{ backgroundColor: "#1f2244", color: "white" }}
                title="Préparer un ZIP avec le bilan Qualiopi + les contrats de sous-traitance + le manifest formateurs (Qualiopi audit)"
              >
                📦 Dossier audit
              </a>
            </div>
          )}
          <span className="text-xl" style={{ color: "#9ca3af" }} aria-hidden>
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </button>

      {expanded && (
      <div className="px-6 pb-6">

      {/* Liens Google Sheets : Qualiopi + BPF */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
        <SheetCard
          title="Indicateurs Qualiopi"
          subtitle="Pour audit Qualiopi"
          icon="📗"
          color="#166534"
          bg="#f0fdf4"
          sheet={sheetInfo}
          cronName="sync-qualiopi-sheet"
        />
        <SheetCard
          title="BPF — Bilan Pédagogique et Financier"
          subtitle="Cerfa 10443 pour la DREETS"
          icon="📘"
          color="#1d4ed8"
          bg="#eff6ff"
          sheet={bpfSheetInfo}
          cronName="sync-bpf-sheet"
        />
      </div>

      {/* Documents Qualiopi externes (veille + partenariats) */}
      <ExternalLinks links={qualiopiLinks} />

      {loading && (
        <div className="text-sm font-jetbrains" style={{ color: "#9ca3af" }}>Chargement des indicateurs…</div>
      )}

      {!loading && stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* === Activité === */}
          <QualiopiBlock title="Activité" icon="🏛">
            <div className="text-[11px] font-jetbrains mb-3" style={{ color: "#727485" }}>
              <strong style={{ color: "#1f2244" }}>{stats.activity.sessionsCount}</strong> session{stats.activity.sessionsCount > 1 ? "s" : ""} terminée{stats.activity.sessionsCount > 1 ? "s" : ""}
              {" · "}
              <strong style={{ color: "#1f2244" }}>{stats.activity.formationsDistinctesCount}</strong> formation{stats.activity.formationsDistinctesCount > 1 ? "s" : ""} distincte{stats.activity.formationsDistinctesCount > 1 ? "s" : ""}
              {" · "}
              <strong style={{ color: "#1f2244" }}>{stats.activity.traineesAccueillis}</strong> stagiaire{stats.activity.traineesAccueillis > 1 ? "s" : ""} accueilli{stats.activity.traineesAccueillis > 1 ? "s" : ""}
            </div>
            <MetricBar
              label="Taux d'assiduité moyen"
              value={stats.activity.tauxAssiduiteMoyen}
              max={100}
              suffix=" %"
              color={tauxAssiduiteColor(stats.activity.tauxAssiduiteMoyen)}
              thresholds={[75, 90]}
            />
            <MetricBar
              label="Heures-stagiaires réalisées"
              value={stats.activity.heuresStagiairesRealisees}
              max={Math.max(stats.activity.heuresStagiairesNominales, 1)}
              suffix=" h"
              hint={`/ ${stats.activity.heuresStagiairesNominales} h nominales`}
              color="#3730a3"
            />
            <div className="flex items-center justify-between text-xs font-jetbrains mt-3 pt-3 border-t" style={{ borderColor: "#e5e7eb" }}>
              <span style={{ color: "#727485" }}>♿ Stagiaires en situation de handicap</span>
              <strong style={{ color: stats.activity.stagiairesPSH > 0 ? "#3730a3" : "#1f2244" }}>
                {stats.activity.stagiairesPSH}
              </strong>
            </div>
          </QualiopiBlock>

          {/* === Pédagogie === */}
          <QualiopiBlock title="Atteinte des objectifs pédagogiques" icon="🎯">
            <BigPercent
              label="Taux d'atteinte (évalués)"
              value={stats.pedagogy.tauxAtteinte}
              color={tauxAtteinteColor(stats.pedagogy.tauxAtteinte)}
            />
            <StackedSegments
              total={stats.pedagogy.traineesTotal}
              segments={[
                { value: stats.pedagogy.atteints, color: "#16a34a", label: "Atteints" },
                { value: stats.pedagogy.partiellementAtteints, color: "#f59e0b", label: "Partiels" },
                { value: stats.pedagogy.nonAtteints, color: "#dc2626", label: "Non atteints" },
                { value: stats.pedagogy.nonEvalues, color: "#9ca3af", label: "Non évalués" },
              ]}
            />
            {stats.pedagogy.nonEvalues > 0 && (
              <div className="text-[11px] font-jetbrains mt-2" style={{ color: "#92400e" }}>
                ⚠ {stats.pedagogy.nonEvalues} stagiaire{stats.pedagogy.nonEvalues > 1 ? "s" : ""} non évalué{stats.pedagogy.nonEvalues > 1 ? "s" : ""} — à compléter pour fiabiliser
              </div>
            )}
          </QualiopiBlock>

          {/* === Satisfaction à chaud === */}
          <QualiopiBlock title="Satisfaction à chaud" icon="🔥">
            <div className="flex items-center gap-3 mb-3">
              <Gauge
                value={stats.satisfactionChaud.globalAverage}
                max={5}
                color={satisfactionColor(stats.satisfactionChaud.globalAverage, 5) ?? "#9ca3af"}
                label="Satisfaction"
              />
              <NpsDial
                score={stats.satisfactionChaud.npsScore}
                promoters={stats.satisfactionChaud.npsPromoters}
                passives={stats.satisfactionChaud.npsPassives}
                detractors={stats.satisfactionChaud.npsDetractors}
                total={stats.satisfactionChaud.npsTotal}
              />
            </div>
            <MetricBar
              label="Taux de réponse"
              value={Math.round(stats.satisfactionChaud.responseRate * 100)}
              max={100}
              suffix=" %"
              hint={`${stats.satisfactionChaud.submittedTotal} / ${stats.satisfactionChaud.invitedTotal}`}
              color={tauxReponseColor(stats.satisfactionChaud.responseRate)}
              thresholds={[30, 60]}
            />
          </QualiopiBlock>

          {/* === Satisfaction à froid === */}
          <QualiopiBlock title="Satisfaction à froid (impact 3 mois)" icon="❄">
            <div className="flex items-center gap-3 mb-3">
              <Gauge
                value={stats.satisfactionFroid.globalAverage}
                max={5}
                color={satisfactionColor(stats.satisfactionFroid.globalAverage, 5) ?? "#9ca3af"}
                label="Impact"
              />
              <NpsDial
                score={stats.satisfactionFroid.npsScore}
                promoters={stats.satisfactionFroid.npsPromoters}
                passives={stats.satisfactionFroid.npsPassives}
                detractors={stats.satisfactionFroid.npsDetractors}
                total={stats.satisfactionFroid.npsTotal}
              />
            </div>
            <MetricBar
              label="Taux de réponse"
              value={Math.round(stats.satisfactionFroid.responseRate * 100)}
              max={100}
              suffix=" %"
              hint={`${stats.satisfactionFroid.submittedTotal} / ${stats.satisfactionFroid.invitedTotal}`}
              color={tauxReponseColor(stats.satisfactionFroid.responseRate)}
              thresholds={[30, 60]}
            />
          </QualiopiBlock>

          {/* === Satisfaction formateurs === */}
          <QualiopiBlock title="Satisfaction formateurs" icon="👤">
            <div className="flex items-center justify-center mb-3">
              <Gauge
                value={stats.trainerSat.globalAverage}
                max={4}
                color={satisfactionColor(stats.trainerSat.globalAverage, 4) ?? "#9ca3af"}
                label="Note moyenne"
                size="large"
              />
            </div>
            <MetricBar
              label="Taux de réponse"
              value={Math.round(stats.trainerSat.responseRate * 100)}
              max={100}
              suffix=" %"
              hint={`${stats.trainerSat.submittedTotal} / ${stats.trainerSat.invitedTotal}`}
              color={tauxReponseColor(stats.trainerSat.responseRate)}
              thresholds={[30, 60]}
            />
          </QualiopiBlock>

          {/* === Réclamations === */}
          <QualiopiBlock title="Réclamations (indicateur 32)" icon="⚠">
            <div className="grid grid-cols-2 gap-2 mb-3">
              <CounterChip icon="📥" value={stats.complaints.total} label="Total" />
              <CounterChip
                icon="✅"
                value={stats.complaints.resolved}
                label={stats.complaints.total > 0 ? `Résolues (${formatRate(stats.complaints.resolutionRate)})` : "Résolues"}
                color="#166534"
              />
              <CounterChip
                icon="⏳"
                value={stats.complaints.unresolved}
                label="En cours"
                color={stats.complaints.unresolved > 0 ? "#92400e" : "#727485"}
              />
              <CounterChip
                icon="🚨"
                value={stats.complaints.overdue}
                label="En retard (>30 j)"
                color={stats.complaints.overdue > 0 ? "#991b1b" : "#166534"}
              />
            </div>
            {stats.complaints.total > 0 && (
              <StackedSegments
                total={stats.complaints.total}
                segments={[
                  { value: stats.complaints.byStatus.new, color: "#dc2626", label: "Nouvelles" },
                  { value: stats.complaints.byStatus.in_progress, color: "#f59e0b", label: "En cours" },
                  { value: stats.complaints.byStatus.resolved, color: "#16a34a", label: "Résolues" },
                  { value: stats.complaints.byStatus.closed, color: "#6b7280", label: "Clôturées" },
                ]}
              />
            )}
            <div className="text-[11px] font-jetbrains mt-2 text-right" style={{ color: "#727485" }}>
              Délai moyen de résolution :{" "}
              <strong style={{ color: "#1f2244" }}>
                {stats.complaints.averageResolutionDays > 0 ? `${stats.complaints.averageResolutionDays} j` : "—"}
              </strong>
            </div>
          </QualiopiBlock>
        </div>
      )}

      {!loading && !stats && (
        <div className="text-sm font-jetbrains" style={{ color: "#991b1b" }}>
          Impossible de charger les indicateurs.
        </div>
      )}
      </div>
      )}
    </div>
  );
}

// === Liens externes Qualiopi (veille + partenariats) ===
function ExternalLinks({ links }: { links: QualiopiLinks | null }) {
  if (!links) return null;
  const items: { label: string; icon: string; href: string; indicators: string }[] = [];
  if (links.veille) items.push({ label: "Veille (socio-éco / légale / pédago)", icon: "📊", href: links.veille, indicators: "Ind. 25-27" });
  if (links.partenaires) items.push({ label: "Partenaires handicap (PSH)", icon: "♿", href: links.partenaires, indicators: "Ind. 28 — périmètre d'activité" });

  if (items.length === 0) {
    return (
      <div className="p-3 rounded-lg border text-xs font-jetbrains mb-4" style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb", color: "#92400e" }}>
        💡 Tu peux lier ici tes docs de <strong>veille</strong> et de <strong>partenaires handicap</strong> (indicateurs 25-28) — voir Paramètres communs → 🔗 Liens Qualiopi.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow"
          style={{ borderColor: "#e5e7eb", backgroundColor: "#fafbff" }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xl">{it.icon}</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate" style={{ color: "#1f2244" }}>{it.label}</div>
              <div className="text-[11px] font-jetbrains" style={{ color: "#727485" }}>{it.indicators} · Document Drive externe</div>
            </div>
          </div>
          <span className="text-sm" style={{ color: "#1f2244" }}>↗</span>
        </a>
      ))}
    </div>
  );
}

// === Carte d'accès à un Google Sheet (Qualiopi ou BPF) ===
function SheetCard({
  title,
  subtitle,
  icon,
  color,
  bg,
  sheet,
  cronName,
}: {
  title: string;
  subtitle: string;
  icon: string;
  color: string;
  bg: string;
  sheet: QualiopiSheetInfo | null;
  cronName: string;
}) {
  if (sheet?.spreadsheetUrl) {
    return (
      <a
        href={sheet.spreadsheetUrl}
        target="_blank"
        rel="noreferrer"
        className="flex items-center justify-between gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow"
        style={{ borderColor: "#e5e7eb", backgroundColor: bg }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xl">{icon}</span>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color }}>
              {title}
            </div>
            <div className="text-[11px] font-jetbrains" style={{ color: "#727485" }}>
              {subtitle}
              {" · "}
              {sheet.lastSync
                ? `Dernière synchro : ${new Date(sheet.lastSync).toLocaleString("fr-FR")}`
                : "Jamais synchronisé"}
            </div>
          </div>
        </div>
        <span className="text-sm" style={{ color }}>↗</span>
      </a>
    );
  }
  return (
    <div
      className="p-3 rounded-lg border text-xs font-jetbrains"
      style={{ borderColor: "#fde68a", backgroundColor: "#fffbeb", color: "#92400e" }}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <strong>{title}</strong>
      </div>
      <div className="mt-1">
        Sera créé lors de la première synchro automatique (cron <code>{cronName}</code>).
      </div>
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
      <div>{children}</div>
    </div>
  );
}

// === Compteur encadré (icône + nombre + libellé) ===
function CounterChip({
  icon,
  value,
  label,
  color,
}: {
  icon: string;
  value: number;
  label: string;
  color?: string;
}) {
  return (
    <div className="p-2 rounded-lg flex items-center gap-2" style={{ backgroundColor: "white", border: "1px solid #e5e7eb" }}>
      <div className="text-xl">{icon}</div>
      <div className="min-w-0">
        <div className="text-lg font-bold leading-tight" style={{ color: color || "#1f2244" }}>{value}</div>
        <div className="text-[10px] font-jetbrains truncate" style={{ color: "#727485" }}>{label}</div>
      </div>
    </div>
  );
}

// === Barre de progression horizontale avec marqueurs de seuils ===
function MetricBar({
  label,
  value,
  max,
  suffix = "",
  hint,
  color,
  thresholds,
}: {
  label: string;
  value: number;
  max: number;
  suffix?: string;
  hint?: string;
  color: string;
  thresholds?: [number, number]; // [orange, green] sur la même échelle que value/max
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="mb-3 last:mb-0">
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <div className="text-xs font-jetbrains" style={{ color: "#727485" }}>{label}</div>
        <div className="text-right">
          <span className="text-sm font-semibold font-jetbrains" style={{ color }}>
            {value}{suffix}
          </span>
          {hint && <span className="text-[10px] font-jetbrains ml-2" style={{ color: "#9ca3af" }}>{hint}</span>}
        </div>
      </div>
      <div className="relative h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all"
          style={{ width: `${ratio * 100}%`, backgroundColor: color }}
        />
        {thresholds && (
          <>
            <div
              className="absolute inset-y-0 w-px"
              style={{ left: `${(thresholds[0] / max) * 100}%`, backgroundColor: "#cbd5e1" }}
              title={`seuil orange ${thresholds[0]}${suffix}`}
            />
            <div
              className="absolute inset-y-0 w-px"
              style={{ left: `${(thresholds[1] / max) * 100}%`, backgroundColor: "#cbd5e1" }}
              title={`seuil vert ${thresholds[1]}${suffix}`}
            />
          </>
        )}
      </div>
    </div>
  );
}

// === Grand pourcentage (taux d'atteinte pédagogique) ===
function BigPercent({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center mb-3">
      <div className="text-3xl font-bold" style={{ color }}>{value} %</div>
      <div className="text-[11px] font-jetbrains" style={{ color: "#727485" }}>{label}</div>
    </div>
  );
}

// === Barre empilée avec légende (segments colorés horizontaux) ===
function StackedSegments({
  total,
  segments,
}: {
  total: number;
  segments: { value: number; color: string; label: string }[];
}) {
  if (total === 0) {
    return (
      <div className="text-[11px] font-jetbrains italic text-center py-2" style={{ color: "#9ca3af" }}>
        Aucune donnée
      </div>
    );
  }
  return (
    <div>
      <div className="flex h-5 rounded-lg overflow-hidden" style={{ backgroundColor: "#e5e7eb" }}>
        {segments.map((s, i) =>
          s.value > 0 ? (
            <div
              key={i}
              style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
              title={`${s.label} : ${s.value}`}
            />
          ) : null
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-1 text-[11px] font-jetbrains" style={{ color: "#1f2244" }}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            <span style={{ color: "#727485" }}>{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

// === Jauge semi-circulaire SVG ===
// L'arc occupe la moitié supérieure ; on superpose la valeur en HTML
// (positionnée en absolute) dans la zone vide du demi-cercle, puis le
// label en dessous avec un vrai espacement vertical.
function Gauge({
  value,
  max,
  color,
  label,
  size = "normal",
}: {
  value: number | null;
  max: number;
  color: string;
  label: string;
  size?: "normal" | "large";
}) {
  const dim = size === "large" ? 160 : 120;
  const stroke = size === "large" ? 14 : 10;
  const radius = (dim - stroke) / 2;
  const cy = dim / 2;
  const svgHeight = cy + stroke / 2; // moitié supérieure + épaisseur du trait
  const circ = Math.PI * radius;
  const ratio = value !== null && max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const dash = circ * ratio;

  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="relative" style={{ width: dim, height: svgHeight }}>
        <svg width={dim} height={svgHeight} viewBox={`0 0 ${dim} ${svgHeight}`}>
          {/* Demi-cercle fond */}
          <path
            d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${dim - stroke / 2} ${cy}`}
            fill="none"
            stroke="#e5e7eb"
            strokeWidth={stroke}
            strokeLinecap="round"
          />
          {/* Demi-cercle valeur */}
          {value !== null && (
            <path
              d={`M ${stroke / 2} ${cy} A ${radius} ${radius} 0 0 1 ${dim - stroke / 2} ${cy}`}
              fill="none"
              stroke={color}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circ}`}
              style={{ transition: "stroke-dasharray 0.5s ease" }}
            />
          )}
        </svg>
        {/* Valeur centrée en HTML dans la zone vide du demi-cercle */}
        <div
          className="absolute left-0 right-0 text-center pointer-events-none"
          style={{ bottom: stroke / 2 + 2 }}
        >
          <div
            className="font-bold leading-none"
            style={{ color, fontSize: size === "large" ? 30 : 24 }}
          >
            {value !== null ? value : "—"}
          </div>
          <div
            className="font-jetbrains leading-tight"
            style={{ color: "#9ca3af", fontSize: 10, marginTop: 2 }}
          >
            / {max}
          </div>
        </div>
      </div>
      <div className="text-[11px] font-jetbrains mt-2 text-center" style={{ color: "#727485" }}>
        {label}
      </div>
    </div>
  );
}

// === Cadran NPS (-100 → +100 avec curseur) ===
function NpsDial({
  score,
  promoters,
  passives,
  detractors,
  total,
}: {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
}) {
  const width = 120;
  const height = 80;
  // Curseur : -100 → 0, +100 → width
  const cursorX = score !== null ? ((score + 100) / 200) * width : null;
  const scoreColor = npsColor(score) ?? "#9ca3af";

  return (
    <div className="flex-1 flex flex-col items-center">
      <div className="text-2xl font-bold" style={{ color: scoreColor }}>
        {score !== null ? (score > 0 ? `+${score}` : String(score)) : "—"}
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Gradient -100/+100 : rouge → orange → vert */}
        <defs>
          <linearGradient id="nps-gradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#dc2626" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#16a34a" />
          </linearGradient>
        </defs>
        <rect x={0} y={28} width={width} height={8} rx={4} fill="url(#nps-gradient)" />
        {/* Marqueur 0 (vertical milieu) */}
        <line x1={width / 2} y1={24} x2={width / 2} y2={40} stroke="#1f2244" strokeWidth={1} />
        {/* Curseur du score */}
        {cursorX !== null && (
          <>
            <line x1={cursorX} y1={20} x2={cursorX} y2={44} stroke={scoreColor} strokeWidth={3} strokeLinecap="round" />
            <circle cx={cursorX} cy={20} r={3} fill={scoreColor} />
          </>
        )}
        {/* Échelle -100 / 0 / +100 */}
        <text x={0} y={56} fontSize={9} fill="#9ca3af">-100</text>
        <text x={width / 2} y={56} fontSize={9} fill="#9ca3af" textAnchor="middle">0</text>
        <text x={width} y={56} fontSize={9} fill="#9ca3af" textAnchor="end">+100</text>
        {/* Mini-stacked sous le cadran (P/Pa/D) */}
        {total > 0 && (
          <g transform={`translate(0, ${height - 14})`}>
            <rect x={0} y={0} width={(detractors / total) * width} height={5} fill="#dc2626" />
            <rect
              x={(detractors / total) * width}
              y={0}
              width={(passives / total) * width}
              height={5}
              fill="#f59e0b"
            />
            <rect
              x={((detractors + passives) / total) * width}
              y={0}
              width={(promoters / total) * width}
              height={5}
              fill="#16a34a"
            />
          </g>
        )}
      </svg>
      <div className="text-[10px] font-jetbrains" style={{ color: "#727485" }}>
        NPS · {total > 0 ? `${promoters} P / ${passives} Pa / ${detractors} D` : "0 répondant"}
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
