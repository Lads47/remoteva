import { z } from "zod";
import { VALID_REGIES } from "./flow";
import { VALID_CONFERENCE_STATUSES } from "./conference";

// === Helpers ===

const dateString = z
  .string()
  .refine((s) => !isNaN(Date.parse(s)), { message: "Date invalide (format ISO 8601 attendu)" });

const optionalDateString = dateString.nullable().optional();

const regieSchema = z.enum(VALID_REGIES);

const conferenceStatusSchema = z.enum(VALID_CONFERENCE_STATUSES);

// === FlowProject ===

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, "Le titre est requis"),
  date: dateString,
  location: z.string().trim().min(1, "Le lieu est requis"),
  room: z.string().trim().min(1, "La salle est requise"),
  speaker: z.string().trim().optional().default(""),
  director: z.string().trim().optional().default(""),
  directorId: z.string().nullable().optional(),
  notes: z.string().trim().optional().default(""),
  conferences: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        speaker: z.string().trim().optional().default(""),
        order: z.number().int().positive().optional(),
        scheduledStart: optionalDateString,
        scheduledEnd: optionalDateString,
      })
    )
    .optional(),
});

export const updateProjectSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).optional(),
  date: dateString.optional(),
  location: z.string().trim().min(1).optional(),
  room: z.string().trim().min(1).optional(),
  speaker: z.string().trim().optional(),
  director: z.string().trim().optional(),
  directorId: z.string().nullable().optional(),
  regie: regieSchema.nullable().optional(),
  recordingLocalPath: z.string().nullable().optional(),
  notes: z.string().trim().optional(),
});

export const prepareProjectSchema = z.object({
  regie: regieSchema,
  director: z.string().trim().optional(),
  recordingLocalPath: z.string().trim().optional(),
});

// === Conference ===

export const createConferenceSchema = z.object({
  title: z.string().trim().min(1),
  speaker: z.string().trim().optional().default(""),
  order: z.number().int().positive().optional(),
  scheduledStart: optionalDateString,
  scheduledEnd: optionalDateString,
});

export const updateConferenceSchema = z.object({
  title: z.string().trim().min(1).optional(),
  speaker: z.string().trim().optional(),
  order: z.number().int().positive().optional(),
  status: conferenceStatusSchema.optional(),
  scheduledStart: optionalDateString,
  scheduledEnd: optionalDateString,
  startTime: optionalDateString,
  endTime: optionalDateString,
  localFolder: z.string().nullable().optional(),
  durationSeconds: z.number().int().nonnegative().nullable().optional(),
});

export const recordingStoppedSchema = z.object({
  localFolder: z.string().trim().optional(),
  durationSeconds: z.number().int().nonnegative().optional(),
});

// === Director ===

export const createDirectorSchema = z.object({
  name: z.string().trim().min(1, "Le nom est requis"),
  email: z.string().trim().email("Email invalide"),
  phone: z.string().trim().optional().default(""),
});

export const updateDirectorSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().email().optional(),
  phone: z.string().trim().optional(),
  active: z.boolean().optional(),
});

// === ApiKey ===

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Le nom de la clé est requis"),
  expiresAt: optionalDateString,
});

// === Availability ===

export const availabilitySchema = z.object({
  token: z.string().trim().min(1, "Token requis"),
  date: dateString,
});

// === Formations ===

export const VALID_SESSION_STATUSES = [
  "planned",
  "open",
  "full",
  "closed",
  "cancelled",
] as const;

export const VALID_TRAINEE_STATUSES = [
  "inscrit",
  "devis_envoye",
  "devis_signe",
  "convention_envoyee",
  "convention_signee",
  "valide",
  "convoque",
  "en_formation",
  "termine",
  "abandonne",
] as const;

export const VALID_INSCRIPTION_TYPES = ["particulier", "entreprise"] as const;

export const VALID_MODES_FINANCEMENT = [
  "Fonds propres entreprise",
  "AFDAS (Intermittents)",
  "OPCO entreprise",
  "France Travail",
  "Financement personnel",
] as const;

export const VALID_STATUTS_ACTUELS = [
  "Salarié (CDI, CDD)",
  "Intermittent du spectacle",
  "Indépendant / Auto-entrepreneur / Libéral",
  "Demandeur d'emploi",
  "Particulier (Étudiant, autre)",
] as const;

const sessionStatusSchema = z.enum(VALID_SESSION_STATUSES);

export const createFormationSchema = z.object({
  code: z.string().trim().min(1, "Code requis"),
  nomLong: z.string().trim().min(1, "Nom complet requis"),
  description: z.string().trim().optional().default(""),
  prixHT: z.number().nonnegative("Prix HT >= 0"),
  dureeJours: z.number().int().positive("Durée >= 1 jour"),
  active: z.boolean().optional(),
  sellsyPipelineId: z.number().int().nullable().optional(),
  sellsyStepInitial: z.number().int().nullable().optional(),
  sellsyServiceId: z.number().int().nullable().optional(),
  codeOpportunite: z.string().trim().optional().default(""),
  driveDossierRacineId: z.string().trim().nullable().optional(),
  driveDossierSessionsId: z.string().trim().nullable().optional(),
  driveTemplateProgrammeId: z.string().trim().nullable().optional(),
  driveTemplateConventionId: z.string().trim().nullable().optional(),
  driveTemplateContratId: z.string().trim().nullable().optional(),
  driveTemplateConvocationId: z.string().trim().nullable().optional(),
  driveTemplateEmargementId: z.string().trim().nullable().optional(),
  driveTemplateSuiviId: z.string().trim().nullable().optional(),
  configForm: z.string().optional().default("{}"),
});

export const updateFormationSchema = createFormationSchema.partial();

export const createSessionSchema = z.object({
  formationId: z.string().trim().min(1, "Formation requise"),
  code: z.string().trim().optional(),                          // Auto-généré si absent
  dateDebut: dateString,
  dateFin: dateString,
  capacite: z.number().int().positive().optional().default(8),
  lieu: z.string().trim().optional().default(""),
  horaires: z.string().trim().optional().default(""),
  status: sessionStatusSchema.optional(),
  notes: z.string().trim().optional().default(""),
});

const emailSchema = z.string().trim().toLowerCase().email("Email invalide");

// Public inscription (formulaire d'inscription stagiaire)
export const publicInscriptionSchema = z
  .object({
    sessionId: z.string().trim().min(1, "Session requise"),

    // Identité
    nom: z.string().trim().min(1, "Nom requis"),
    prenom: z.string().trim().min(1, "Prénom requis"),
    email: emailSchema,
    telephone: z.string().trim().min(1, "Téléphone requis"),

    // Type
    inscriptionType: z.enum(VALID_INSCRIPTION_TYPES),

    // Statut professionnel (commun à tous)
    statutActuel: z.enum(VALID_STATUTS_ACTUELS),

    // Financement (commun à tous)
    modeFinancement: z.enum(VALID_MODES_FINANCEMENT),

    // Entreprise (requis si inscriptionType === "entreprise")
    raisonSociale: z.string().trim().optional().default(""),
    siret: z.string().trim().optional().default(""),
    adresseSiege: z.string().trim().optional().default(""),
    domaineActivite: z.string().trim().optional().default(""),
    contactAdmin: z.string().trim().optional().default(""),

    // Particulier (requis si inscriptionType === "particulier")
    adressePostale: z.string().trim().optional().default(""),

    // Accessibilité (PSH oui/non)
    psh: z.boolean().default(false),

    // Adaptations pédagogiques (oui/non + précisions si oui)
    aBesoinsAdaptation: z.boolean().default(false),
    besoinsAdaptation: z.string().trim().optional().default(""),

    // Pré-requis : objet libre (clés/valeurs spécifiques à la formation)
    prerequis: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional().default({}),

    // Consentement RGPD (obligatoire, Qualiopi)
    consentementRgpd: z.literal(true, { message: "Consentement RGPD requis" }),
  })
  .superRefine((data, ctx) => {
    if (data.inscriptionType === "entreprise") {
      if (!data.raisonSociale)
        ctx.addIssue({ code: "custom", path: ["raisonSociale"], message: "Raison sociale requise" });
      if (!data.siret || !/^\d{14}$/.test(data.siret.replace(/\s+/g, "")))
        ctx.addIssue({ code: "custom", path: ["siret"], message: "SIRET (14 chiffres) requis" });
      if (!data.adresseSiege)
        ctx.addIssue({ code: "custom", path: ["adresseSiege"], message: "Adresse du siège requise" });
      if (!data.domaineActivite)
        ctx.addIssue({ code: "custom", path: ["domaineActivite"], message: "Domaine d'activité requis" });
    } else {
      if (!data.adressePostale)
        ctx.addIssue({ code: "custom", path: ["adressePostale"], message: "Adresse postale requise" });
    }
    if (data.aBesoinsAdaptation && !data.besoinsAdaptation) {
      ctx.addIssue({
        code: "custom",
        path: ["besoinsAdaptation"],
        message: "Merci de préciser vos besoins",
      });
    }
  });

// Admin update d'un stagiaire (correction de saisie principalement).
// Pas d'édition de la session ni du type d'inscription après création
// (ces champs sont liés aux ressources Sellsy déjà créées).
export const adminUpdateTraineeSchema = z.object({
  nom: z.string().trim().min(1).optional(),
  prenom: z.string().trim().min(1).optional(),
  email: emailSchema.optional(),
  telephone: z.string().trim().optional(),
  statutActuel: z.string().trim().optional(),
  modeFinancement: z.enum(VALID_MODES_FINANCEMENT).optional(),

  // Volet entreprise
  raisonSociale: z.string().trim().optional(),
  siret: z.string().trim().optional(),
  adresseSiege: z.string().trim().optional(),
  domaineActivite: z.string().trim().optional(),
  contactAdmin: z.string().trim().optional(),

  // Volet particulier
  adressePostale: z.string().trim().optional(),

  // Accessibilité
  psh: z.boolean().optional(),
  besoinsAdaptation: z.string().trim().optional(),

  // Attentes
  attentes: z.string().trim().optional(),
});

export const updateSessionSchema = z.object({
  code: z.string().trim().min(1).optional(),
  dateDebut: dateString.optional(),
  dateFin: dateString.optional(),
  capacite: z.number().int().positive().optional(),
  lieu: z.string().trim().optional(),
  horaires: z.string().trim().optional(),
  status: sessionStatusSchema.optional(),
  driveFolderId: z.string().trim().nullable().optional(),
  driveSuiviFileId: z.string().trim().nullable().optional(),
  notes: z.string().trim().optional(),
});

// === Sync offline ===

export const syncOfflineSchema = z.object({
  clientId: z.string().trim().optional(),  // pour idempotence côté client
  project: z.object({
    eventId: z.string().trim().optional(),  // si fourni, on essaie de matcher (offline merge)
    title: z.string().trim().min(1),
    date: dateString,
    location: z.string().trim().min(1),
    room: z.string().trim().min(1),
    speaker: z.string().trim().optional().default(""),
    director: z.string().trim().optional().default(""),
    regie: regieSchema.nullable().optional(),
    recordingLocalPath: z.string().nullable().optional(),
    notes: z.string().trim().optional().default(""),
  }),
  conferences: z.array(
    z.object({
      order: z.number().int().positive(),
      title: z.string().trim().min(1),
      speaker: z.string().trim().optional().default(""),
      status: conferenceStatusSchema.optional(),
      scheduledStart: optionalDateString,
      scheduledEnd: optionalDateString,
      startTime: optionalDateString,
      endTime: optionalDateString,
      localFolder: z.string().nullable().optional(),
      durationSeconds: z.number().int().nonnegative().nullable().optional(),
    })
  ),
});
