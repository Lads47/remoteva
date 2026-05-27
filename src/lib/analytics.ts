// Agrégations annuelles pour le tableau de bord Qualiopi.
//
// Toutes les fonctions prennent un `year` en paramètre et filtrent sur les
// SESSIONS dont `dateFin` tombe dans cette année (et non cancelled). C'est
// le pivot temporel naturel pour le bilan d'activité : on compte une session
// dans le bilan de l'année où elle s'est terminée.
//
// Une "heure-stagiaire" = 1 heure de présence d'un stagiaire = unité standard
// pour le BPF. 1 demi-journée d'émargement = 3,5 h (cohérent avec le calcul
// des présences sur le certificat de réalisation).

import prisma from "./db";
import { getComplaintStats, type ComplaintStats } from "./complaint";

const EXCLUDED_SESSION_STATUSES = ["cancelled"];
const NPS_QUESTION_CHAUD = "recommandation_nps";
const NPS_QUESTION_FROID = "recommandation_nps_froid";
// Les questions Likert 1-5 du set chaud par défaut qu'on agrège pour la
// "satisfaction moyenne globale". On ignore les autres (yes_no, textarea…).
const SATISFACTION_LIKERT_KEYS_CHAUD = new Set([
  "satisfaction_globale",
  "attentes",
  "atteinte_objectifs",
  "clarte_contenu",
  "competence_formateur",
  "disponibilite_formateur",
  "qualite_animation",
  "utilite_exercices",
  "qualite_supports",
  "qualite_organisation",
]);
const SATISFACTION_LIKERT_KEYS_FROID = new Set([
  "competences_acquises",
  "transfert_poste",
  "amelioration_efficacite",
]);
// Les 3 questions likert_4 (1-4) du formulaire formateur
const TRAINER_LIKERT_KEYS = new Set([
  "attentes_beneficiaires",
  "gestion_admin",
  "delai_traitement",
]);

// Filtre dateFin "session effectivement terminée dans l'année" :
//   - dans l'intervalle [01-01, 01-01 année+1[
//   - ET déjà dans le passé (pas de session future comptée comme réalisée)
// Sans le `lte: now`, une session future dont l'année tombe dans la plage
// sélectionnée serait incluse → comptes faussés (heures nominales reportées
// comme réalisées, assiduité 100 %, etc.).
function yearRange(year: number) {
  return { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1), lte: new Date() };
}

// === Activité (volume + heures-stagiaires) ===

export interface ActivityStats {
  year: number;
  sessionsCount: number;
  formationsDistinctesCount: number;
  traineesAccueillis: number;
  heuresStagiairesRealisees: number;    // somme heures présence réelles (fallback nominales si pas d'émargement)
  heuresStagiairesNominales: number;    // somme heures attendues (capacité)
  tauxAssiduiteMoyen: number;           // 0..100
  stagiairesPSH: number;
}

export async function getActivityStats(year: number): Promise<ActivityStats> {
  const range = yearRange(year);
  const sessions = await prisma.session.findMany({
    where: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: {
      formationId: true,
      formation: { select: { dureeJours: true } },
      trainees: {
        select: {
          id: true,
          psh: true,
          attendances: { where: { status: "present" }, select: { id: true } },
        },
      },
    },
  });

  let traineesAccueillis = 0;
  let stagiairesPSH = 0;
  let heuresRealisees = 0;
  let heuresNominales = 0;
  const formationsDistinctes = new Set<string>();

  for (const s of sessions) {
    formationsDistinctes.add(s.formationId);
    const heuresNominalesParStagiaire = s.formation.dureeJours * 7;
    for (const t of s.trainees) {
      traineesAccueillis++;
      if (t.psh) stagiairesPSH++;
      const nbSlots = t.attendances.length;
      // Fallback durée nominale si aucun émargement n'a été saisi en BDD
      // (cohérent avec computePresenceVariables dans trainee-documents.ts).
      const heuresStagiaire = nbSlots > 0 ? nbSlots * 3.5 : heuresNominalesParStagiaire;
      heuresRealisees += heuresStagiaire;
      heuresNominales += heuresNominalesParStagiaire;
    }
  }

  return {
    year,
    sessionsCount: sessions.length,
    formationsDistinctesCount: formationsDistinctes.size,
    traineesAccueillis,
    heuresStagiairesRealisees: Math.round(heuresRealisees * 10) / 10,
    heuresStagiairesNominales: heuresNominales,
    tauxAssiduiteMoyen: heuresNominales > 0
      ? Math.round((heuresRealisees / heuresNominales) * 100)
      : 0,
    stagiairesPSH,
  };
}

// === Satisfaction (chaud + froid, même shape) ===

export interface SatisfactionStats {
  invitedTotal: number;
  submittedTotal: number;
  responseRate: number;         // 0..1
  npsScore: number | null;      // -100..+100 (null si aucune donnée)
  npsPromoters: number;
  npsPassives: number;
  npsDetractors: number;
  npsTotal: number;
  globalAverage: number | null; // moyenne sur 5 des Likert principaux
  globalCount: number;          // nombre de réponses Likert agrégées
}

function computeNps(values: number[]): {
  score: number | null;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
} {
  if (values.length === 0) {
    return { score: null, promoters: 0, passives: 0, detractors: 0, total: 0 };
  }
  let promoters = 0, passives = 0, detractors = 0;
  for (const v of values) {
    if (v >= 9) promoters++;
    else if (v >= 7) passives++;
    else detractors++;
  }
  const score = Math.round(((promoters - detractors) / values.length) * 100);
  return { score, promoters, passives, detractors, total: values.length };
}

export async function getSatisfactionChaudStats(year: number): Promise<SatisfactionStats> {
  const range = yearRange(year);
  const sessions = await prisma.session.findMany({
    where: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: {
      _count: { select: { trainees: true } },
      satisfactionResponses: {
        where: { submittedAt: { not: null } },
        select: { answers: { select: { questionName: true, value: true } } },
      },
    },
  });

  let invitedTotal = 0;
  let submittedTotal = 0;
  const npsValues: number[] = [];
  let likertSum = 0;
  let likertCount = 0;

  for (const s of sessions) {
    invitedTotal += s._count.trainees;
    submittedTotal += s.satisfactionResponses.length;
    for (const r of s.satisfactionResponses) {
      for (const a of r.answers) {
        if (a.questionName === NPS_QUESTION_CHAUD) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 0 && n <= 10) npsValues.push(n);
        } else if (SATISFACTION_LIKERT_KEYS_CHAUD.has(a.questionName)) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 1 && n <= 5) {
            likertSum += n;
            likertCount++;
          }
        }
      }
    }
  }

  const nps = computeNps(npsValues);
  return {
    invitedTotal,
    submittedTotal,
    responseRate: invitedTotal > 0 ? submittedTotal / invitedTotal : 0,
    npsScore: nps.score,
    npsPromoters: nps.promoters,
    npsPassives: nps.passives,
    npsDetractors: nps.detractors,
    npsTotal: nps.total,
    globalAverage: likertCount > 0 ? Math.round((likertSum / likertCount) * 100) / 100 : null,
    globalCount: likertCount,
  };
}

export async function getSatisfactionFroidStats(year: number): Promise<SatisfactionStats> {
  const range = yearRange(year);
  const sessions = await prisma.session.findMany({
    where: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: {
      _count: { select: { trainees: true } },
      coldEvalResponses: {
        select: { submittedAt: true, answers: { select: { questionName: true, value: true } } },
      },
    },
  });

  let invitedTotal = 0;
  let submittedTotal = 0;
  const npsValues: number[] = [];
  let likertSum = 0;
  let likertCount = 0;

  for (const s of sessions) {
    invitedTotal += s._count.trainees;
    for (const r of s.coldEvalResponses) {
      if (!r.submittedAt) continue;
      submittedTotal++;
      for (const a of r.answers) {
        if (a.questionName === NPS_QUESTION_FROID) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 0 && n <= 10) npsValues.push(n);
        } else if (SATISFACTION_LIKERT_KEYS_FROID.has(a.questionName)) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 1 && n <= 5) {
            likertSum += n;
            likertCount++;
          }
        }
      }
    }
  }

  const nps = computeNps(npsValues);
  return {
    invitedTotal,
    submittedTotal,
    responseRate: invitedTotal > 0 ? submittedTotal / invitedTotal : 0,
    npsScore: nps.score,
    npsPromoters: nps.promoters,
    npsPassives: nps.passives,
    npsDetractors: nps.detractors,
    npsTotal: nps.total,
    globalAverage: likertCount > 0 ? Math.round((likertSum / likertCount) * 100) / 100 : null,
    globalCount: likertCount,
  };
}

// === Pédagogie (atteinte objectifs) ===

type ObjectifsValue = "atteints" | "partiellement_atteints" | "non_atteints" | "";

export interface PedagogyStats {
  year: number;
  traineesTotal: number;
  atteints: number;
  partiellementAtteints: number;
  nonAtteints: number;
  nonEvalues: number;
  tauxAtteinte: number;             // % atteints sur ceux évalués (sans non_evalues)
}

export async function getPedagogyStats(year: number): Promise<PedagogyStats> {
  const range = yearRange(year);
  // On charge en une fois pour éviter N+1 : pour chaque trainee de l'année,
  // ses évaluations + tous les exercices actifs de sa formation.
  const trainees = await prisma.trainee.findMany({
    where: { session: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } } },
    select: {
      id: true,
      objectifsAtteintsOverride: true,
      exerciseEvaluations: {
        where: { exercise: { active: true } },
        select: { globalNote: true, exerciseId: true },
      },
      session: {
        select: {
          formation: {
            select: {
              evaluationExercises: { where: { active: true }, select: { id: true } },
            },
          },
        },
      },
    },
  });

  let atteints = 0;
  let partiellement = 0;
  let nonAtteints = 0;
  let nonEvalues = 0;

  for (const t of trainees) {
    // Override manuel : prime
    const override = t.objectifsAtteintsOverride as ObjectifsValue;
    if (override === "atteints") { atteints++; continue; }
    if (override === "partiellement_atteints") { partiellement++; continue; }
    if (override === "non_atteints") { nonAtteints++; continue; }

    const expectedExercises = t.session.formation.evaluationExercises.length;
    if (expectedExercises === 0) { nonEvalues++; continue; }

    const noteByExercise = new Map<string, string>();
    for (const e of t.exerciseEvaluations) {
      if (e.globalNote) noteByExercise.set(e.exerciseId, e.globalNote);
    }
    const noted = noteByExercise.size;
    if (noted === 0) { nonEvalues++; continue; }

    let cAcquis = 0, cEnCours = 0, cNonAcquis = 0;
    for (const note of noteByExercise.values()) {
      if (note === "acquis") cAcquis++;
      else if (note === "en_cours") cEnCours++;
      else if (note === "non_acquis") cNonAcquis++;
    }
    const cSansNote = expectedExercises - noted;
    // Système pondéré (identique à la suggestion de note globale par exercice) :
    //   - acquis=2, en_cours=1, non_acquis=0, sans_note=0
    //   - ratio ≥ 80% ET aucun non_acquis ET tous notés → "atteints"
    //   - ratio ≥ 50% → "partiellement_atteints"
    //   - sinon → "non_atteints"
    const points = cAcquis * 2 + cEnCours * 1;
    const maxPoints = expectedExercises * 2;
    const ratio = maxPoints > 0 ? points / maxPoints : 0;
    const isComplete = cSansNote === 0 && cNonAcquis === 0 && cEnCours === 0;
    if (ratio >= 0.8 && isComplete) atteints++;
    else if (ratio >= 0.5) partiellement++;
    else nonAtteints++;
  }

  const evalues = atteints + partiellement + nonAtteints;
  return {
    year,
    traineesTotal: trainees.length,
    atteints,
    partiellementAtteints: partiellement,
    nonAtteints,
    nonEvalues,
    tauxAtteinte: evalues > 0 ? Math.round((atteints / evalues) * 100) : 0,
  };
}

// === Satisfaction formateurs ===

export interface TrainerSatStats {
  invitedTotal: number;
  submittedTotal: number;
  responseRate: number;
  globalAverage: number | null;       // moyenne des 3 likert_4 sur 4
  globalCount: number;
}

export async function getTrainerSatStats(year: number): Promise<TrainerSatStats> {
  const range = yearRange(year);
  const sessions = await prisma.session.findMany({
    where: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: {
      trainerEvalResponses: {
        select: { submittedAt: true, answers: { select: { questionName: true, value: true } } },
      },
    },
  });

  let invitedTotal = 0;
  let submittedTotal = 0;
  let likertSum = 0;
  let likertCount = 0;

  for (const s of sessions) {
    invitedTotal += s.trainerEvalResponses.length;
    for (const r of s.trainerEvalResponses) {
      if (!r.submittedAt) continue;
      submittedTotal++;
      for (const a of r.answers) {
        if (TRAINER_LIKERT_KEYS.has(a.questionName)) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 1 && n <= 4) {
            likertSum += n;
            likertCount++;
          }
        }
      }
    }
  }

  return {
    invitedTotal,
    submittedTotal,
    responseRate: invitedTotal > 0 ? submittedTotal / invitedTotal : 0,
    globalAverage: likertCount > 0 ? Math.round((likertSum / likertCount) * 100) / 100 : null,
    globalCount: likertCount,
  };
}

// === Vue agrégée ===

export interface QualiopiOverview {
  year: number;
  activity: ActivityStats;
  satisfactionChaud: SatisfactionStats;
  satisfactionFroid: SatisfactionStats;
  pedagogy: PedagogyStats;
  trainerSat: TrainerSatStats;
  complaints: ComplaintStats;
}

export async function getQualiopiOverview(year: number): Promise<QualiopiOverview> {
  const [activity, satisfactionChaud, satisfactionFroid, pedagogy, trainerSat, complaints] = await Promise.all([
    getActivityStats(year),
    getSatisfactionChaudStats(year),
    getSatisfactionFroidStats(year),
    getPedagogyStats(year),
    getTrainerSatStats(year),
    getComplaintStats(year),
  ]);
  return { year, activity, satisfactionChaud, satisfactionFroid, pedagogy, trainerSat, complaints };
}

// === BPF (Bilan Pédagogique et Financier) ===
//
// Agrégations spécifiques à la déclaration Cerfa 10443. Granularité :
//   - Volume (heures-stagiaires, stagiaires, sessions, formations, PSH)
//   - Origine des stagiaires : par statutActuel (Intermittent / Salarié / DE…)
//   - Type d'inscription : particulier vs entreprise
//   - Financement : par modeFinancement (OPCO / fonds propres / AFDAS / FT…)
//   - OPCO détaillé : par opcoDetecte
//   - Détail par formation (utile pour mapping NSF manuel)
//
// Pivot temporel : sessions dont dateFin tombe dans l'année ET déjà passées
// (même filtre que les autres analytics — via yearRange()).

export interface BpfBreakdown {
  key: string;
  count: number;       // nombre de stagiaires
  heures: number;      // heures-stagiaires réalisées
  ca: number;          // chiffre d'affaires HT (somme montantHT)
}

export interface BpfFormationRow {
  code: string;
  nomLong: string;
  sessions: number;
  trainees: number;
  heures: number;
  ca: number;
}

export interface BpfStats {
  year: number;
  // === Volume ===
  totalTrainees: number;
  totalSessions: number;
  totalFormations: number;
  totalHeuresStagiaires: number;
  totalHeuresStagiairesNominales: number;
  traineesPSH: number;
  totalCaHt: number;
  // === Répartitions ===
  byStatut: BpfBreakdown[];
  byInscriptionType: BpfBreakdown[];
  byMode: BpfBreakdown[];
  byOpco: BpfBreakdown[];
  byFormation: BpfFormationRow[];
}

function bumpBreakdown(map: Map<string, BpfBreakdown>, rawKey: string, count: number, heures: number, ca: number) {
  const key = rawKey.trim() || "Non renseigné";
  const cur = map.get(key) ?? { key, count: 0, heures: 0, ca: 0 };
  cur.count += count;
  cur.heures += heures;
  cur.ca += ca;
  map.set(key, cur);
}

export async function getBpfStats(year: number): Promise<BpfStats> {
  const range = yearRange(year);
  const sessions = await prisma.session.findMany({
    where: { dateFin: range, status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: {
      id: true,
      formationId: true,
      formation: { select: { code: true, nomLong: true, dureeJours: true } },
      trainees: {
        select: {
          psh: true,
          statutActuel: true,
          inscriptionType: true,
          modeFinancement: true,
          opcoDetecte: true,
          montantHT: true,
          attendances: { where: { status: "present" }, select: { id: true } },
        },
      },
    },
  });

  // Accumulateurs globaux
  let totalTrainees = 0;
  let totalHeuresStagiaires = 0;
  let totalHeuresStagiairesNominales = 0;
  let traineesPSH = 0;
  let totalCaHt = 0;
  const formationsDistinctes = new Set<string>();

  // Accumulateurs par répartition
  const byStatut = new Map<string, BpfBreakdown>();
  const byInscriptionType = new Map<string, BpfBreakdown>();
  const byMode = new Map<string, BpfBreakdown>();
  const byOpco = new Map<string, BpfBreakdown>();

  // Accumulateur par formation
  type FormationAcc = {
    code: string;
    nomLong: string;
    sessions: Set<string>;
    trainees: number;
    heures: number;
    ca: number;
  };
  const byFormationMap = new Map<string, FormationAcc>();

  for (const s of sessions) {
    formationsDistinctes.add(s.formationId);
    const heuresNominalesParStagiaire = s.formation.dureeJours * 7;

    const accF = byFormationMap.get(s.formationId) ?? {
      code: s.formation.code,
      nomLong: s.formation.nomLong,
      sessions: new Set<string>(),
      trainees: 0,
      heures: 0,
      ca: 0,
    };
    accF.sessions.add(s.id);

    for (const t of s.trainees) {
      totalTrainees++;
      if (t.psh) traineesPSH++;

      const nbSlots = t.attendances.length;
      const heuresStagiaire = nbSlots > 0 ? nbSlots * 3.5 : heuresNominalesParStagiaire;
      totalHeuresStagiaires += heuresStagiaire;
      totalHeuresStagiairesNominales += heuresNominalesParStagiaire;

      const ca = t.montantHT ?? 0;
      totalCaHt += ca;

      // Par formation
      accF.trainees++;
      accF.heures += heuresStagiaire;
      accF.ca += ca;

      // Par statut professionnel
      bumpBreakdown(byStatut, t.statutActuel, 1, heuresStagiaire, ca);

      // Par type d'inscription
      bumpBreakdown(byInscriptionType, t.inscriptionType, 1, heuresStagiaire, ca);

      // Par mode de financement
      bumpBreakdown(byMode, t.modeFinancement, 1, heuresStagiaire, ca);

      // Par OPCO (seulement si le mode passe par un OPCO ou AFDAS)
      if (t.opcoDetecte.trim()) {
        bumpBreakdown(byOpco, t.opcoDetecte, 1, heuresStagiaire, ca);
      }
    }

    byFormationMap.set(s.formationId, accF);
  }

  // Tri : par count décroissant pour lisibilité dans le sheet
  const toArrSorted = (m: Map<string, BpfBreakdown>): BpfBreakdown[] =>
    Array.from(m.values()).sort((a, b) => b.count - a.count);

  const byFormation: BpfFormationRow[] = Array.from(byFormationMap.values())
    .map((a) => ({
      code: a.code,
      nomLong: a.nomLong,
      sessions: a.sessions.size,
      trainees: a.trainees,
      heures: Math.round(a.heures * 10) / 10,
      ca: Math.round(a.ca * 100) / 100,
    }))
    .sort((a, b) => b.heures - a.heures);

  return {
    year,
    totalTrainees,
    totalSessions: sessions.length,
    totalFormations: formationsDistinctes.size,
    totalHeuresStagiaires: Math.round(totalHeuresStagiaires * 10) / 10,
    totalHeuresStagiairesNominales,
    traineesPSH,
    totalCaHt: Math.round(totalCaHt * 100) / 100,
    byStatut: toArrSorted(byStatut),
    byInscriptionType: toArrSorted(byInscriptionType),
    byMode: toArrSorted(byMode),
    byOpco: toArrSorted(byOpco),
    byFormation,
  };
}

// === Résultats publics par formation (Qualiopi indicateur 1) ===
//
// Agrégats "all-time" pour une formation donnée, destinés à être affichés
// publiquement sur le site lads-website. Ne renvoie QUE des chiffres
// agrégés (jamais de nom individuel) → 0 souci RGPD.
//
// Si moins de MIN_TRAINEES_FOR_PUBLIC stagiaires formés sur toutes les
// sessions terminées, on retourne `hasEnoughData: false` et un volume nul
// — l'UI publique masque alors le bloc plutôt que d'afficher "100% sur
// 1 stagiaire" qui ne signifie rien statistiquement.

const MIN_TRAINEES_FOR_PUBLIC = 5;

export interface FormationPublicResults {
  code: string;
  nomLong: string;
  hasEnoughData: boolean;
  traineesAccueillisTotal: number;
  sessionsCount: number;
  satisfactionAverage: number | null;   // /5
  npsScore: number | null;               // -100..+100
  objectifsAtteintsRate: number;         // 0..100 — sur les évalués uniquement
  responseRate: number;                  // 0..100 — éval à chaud
  lastUpdated: string;                   // ISO timestamp
}

export async function getFormationPublicResults(code: string): Promise<FormationPublicResults | null> {
  const formation = await prisma.formation.findUnique({
    where: { code },
    select: { id: true, code: true, nomLong: true, active: true },
  });
  if (!formation || !formation.active) return null;

  const now = new Date();

  // On charge toutes les sessions terminées de cette formation, avec les
  // données nécessaires aux agrégats (satisfaction + cold eval + override +
  // grilles d'évaluation).
  const sessions = await prisma.session.findMany({
    where: {
      formationId: formation.id,
      status: { notIn: EXCLUDED_SESSION_STATUSES },
      dateFin: { lte: now },
    },
    select: {
      _count: { select: { trainees: true } },
      satisfactionResponses: {
        where: { submittedAt: { not: null } },
        select: { answers: { select: { questionName: true, value: true } } },
      },
      trainees: {
        select: {
          objectifsAtteintsOverride: true,
          exerciseEvaluations: {
            where: { exercise: { active: true } },
            select: { globalNote: true, exerciseId: true },
          },
        },
      },
      formation: {
        select: {
          evaluationExercises: { where: { active: true }, select: { id: true } },
        },
      },
    },
  });

  let invitedTotal = 0;
  let submittedTotal = 0;
  let likertSum = 0;
  let likertCount = 0;
  const npsValues: number[] = [];

  let traineesTotal = 0;
  let atteints = 0;
  let partiellement = 0;
  let nonAtteints = 0;
  // On ne track pas les "non évalués" ici : ils sont juste exclus du calcul
  // de ratio d'atteinte (ils incrémentent traineesTotal mais aucun des 3
  // compteurs ci-dessus → evalues < traineesTotal et le ratio reste juste).

  for (const s of sessions) {
    invitedTotal += s._count.trainees;
    submittedTotal += s.satisfactionResponses.length;
    for (const r of s.satisfactionResponses) {
      for (const a of r.answers) {
        if (a.questionName === NPS_QUESTION_CHAUD) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 0 && n <= 10) npsValues.push(n);
        } else if (SATISFACTION_LIKERT_KEYS_CHAUD.has(a.questionName)) {
          const n = Number(a.value);
          if (Number.isFinite(n) && n >= 1 && n <= 5) {
            likertSum += n;
            likertCount++;
          }
        }
      }
    }

    const expectedExercises = s.formation.evaluationExercises.length;
    for (const t of s.trainees) {
      traineesTotal++;
      const override = t.objectifsAtteintsOverride as
        | "atteints" | "partiellement_atteints" | "non_atteints" | "";
      if (override === "atteints") { atteints++; continue; }
      if (override === "partiellement_atteints") { partiellement++; continue; }
      if (override === "non_atteints") { nonAtteints++; continue; }

      if (expectedExercises === 0) continue;

      const noteByExercise = new Map<string, string>();
      for (const e of t.exerciseEvaluations) {
        if (e.globalNote) noteByExercise.set(e.exerciseId, e.globalNote);
      }
      if (noteByExercise.size === 0) continue;

      // Algo pondéré aligné sur getPedagogyStats (acquis=2, en_cours=1) :
      //   ratio ≥ 80% + complet sans non_acquis → atteints
      //   ratio ≥ 50% → partiellement_atteints
      //   sinon → non_atteints
      // Évite le biais "weakest link" (1 seul exo en_cours sur 5 acquis
      // basculait en partiellement, ce qui est trop sévère pour l'affichage
      // public).
      let cAcquis = 0, cEnCours = 0, cNonAcquis = 0;
      for (const note of noteByExercise.values()) {
        if (note === "acquis") cAcquis++;
        else if (note === "en_cours") cEnCours++;
        else if (note === "non_acquis") cNonAcquis++;
      }
      const cSansNote = expectedExercises - noteByExercise.size;
      const points = cAcquis * 2 + cEnCours * 1;
      const maxPoints = expectedExercises * 2;
      const ratio = maxPoints > 0 ? points / maxPoints : 0;
      const isComplete = cSansNote === 0 && cNonAcquis === 0 && cEnCours === 0;
      if (ratio >= 0.8 && isComplete) atteints++;
      else if (ratio >= 0.5) partiellement++;
      else nonAtteints++;
    }
  }

  const nps = computeNps(npsValues);
  const evalues = atteints + partiellement + nonAtteints;
  const hasEnoughData = traineesTotal >= MIN_TRAINEES_FOR_PUBLIC;

  return {
    code: formation.code,
    nomLong: formation.nomLong,
    hasEnoughData,
    traineesAccueillisTotal: hasEnoughData ? traineesTotal : 0,
    sessionsCount: hasEnoughData ? sessions.length : 0,
    satisfactionAverage:
      hasEnoughData && likertCount > 0
        ? Math.round((likertSum / likertCount) * 10) / 10
        : null,
    npsScore: hasEnoughData ? nps.score : null,
    objectifsAtteintsRate:
      hasEnoughData && evalues > 0 ? Math.round((atteints / evalues) * 100) : 0,
    responseRate:
      hasEnoughData && invitedTotal > 0
        ? Math.round((submittedTotal / invitedTotal) * 100)
        : 0,
    lastUpdated: now.toISOString(),
  };
}

/**
 * Liste les années où on a au moins 1 session non-cancelled qui s'est
 * terminée. Utilisé pour alimenter un sélecteur d'année côté UI.
 */
export async function getAvailableYears(): Promise<number[]> {
  const sessions = await prisma.session.findMany({
    where: { status: { notIn: EXCLUDED_SESSION_STATUSES } },
    select: { dateFin: true },
  });
  const years = new Set<number>();
  for (const s of sessions) years.add(s.dateFin.getFullYear());
  // On inclut toujours l'année courante même si pas de session
  years.add(new Date().getFullYear());
  return Array.from(years).sort((a, b) => b - a);
}
