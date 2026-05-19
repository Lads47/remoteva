import prisma from "./db";

export interface TraineeInfo {
  id: string;
  sessionId: string;
  status: string;
  nom: string;
  prenom: string;
  email: string;
  telephone: string;
  inscriptionType: string;
  raisonSociale: string;
  siret: string;
  adresseSiege: string;
  domaineActivite: string;
  contactAdmin: string;
  adressePostale: string;
  statutActuel: string;
  modeFinancement: string;
  opcoDetecte: string;
  idOpco: string;
  statutDossierFinancement: string;
  montantHT: number | null;
  psh: boolean;
  besoinsAdaptation: string;
  sellsyCompanyId: number | null;
  sellsyIndividualId: number | null;
  sellsyOpportunityId: number | null;
  sellsyEstimateId: number | null;
  driveFolderId: string | null;
  evalEntree: string;
  attentes: string;
  dateEnvoiDevis: Date | null;
  dateSignatureDevis: Date | null;
  dateEnvoiConvention: Date | null;
  dateSignatureConvention: Date | null;
  dateConvocation: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TraineeCreateInput {
  sessionId: string;
  nom: string;
  prenom: string;
  email: string;
  telephone?: string;
  inscriptionType: "particulier" | "entreprise";
  raisonSociale?: string;
  siret?: string;
  adresseSiege?: string;
  domaineActivite?: string;
  contactAdmin?: string;
  adressePostale?: string;
  statutActuel?: string;
  modeFinancement?: string;
  opcoDetecte?: string;
  psh?: boolean;
  besoinsAdaptation?: string;
  evalEntree?: string;
  attentes?: string;
}

export async function getTraineeById(id: string): Promise<TraineeInfo | null> {
  const t = await prisma.trainee.findUnique({ where: { id } });
  return t ? toInfo(t) : null;
}

export interface TraineeEventInfo {
  id: string;
  type: string;
  message: string;
  payload: string;
  createdAt: Date;
}

export interface TraineeDocumentInfo {
  id: string;
  type: string;                    // "convention" | "contrat" | "convocation" | "devis" | ...
  fileName: string;
  driveFileId: string;
  driveFileUrl: string;
  generatedAt: Date;
  sentAt: Date | null;
  signedAt: Date | null;
}

export interface TraineeWithDetails extends TraineeInfo {
  session: {
    id: string;
    code: string;
    dateDebut: Date;
    dateFin: Date;
    lieu: string;
    horaires: string;
    status: string;
  };
  formation: {
    id: string;
    code: string;
    nomLong: string;
    configForm: string;
    // Indique si chaque template est configuré côté formation
    hasTemplateConvention: boolean;
    hasTemplateContrat: boolean;
    hasTemplateConvocation: boolean;
  };
  events: TraineeEventInfo[];
  documents: TraineeDocumentInfo[];
}

export async function getTraineeWithDetails(id: string): Promise<TraineeWithDetails | null> {
  const t = await prisma.trainee.findUnique({
    where: { id },
    include: {
      session: { include: { formation: true } },
      events: { orderBy: { createdAt: "desc" } },
      documents: { orderBy: { generatedAt: "desc" } },
    },
  });
  if (!t) return null;
  return {
    ...toInfo(t),
    session: {
      id: t.session.id,
      code: t.session.code,
      dateDebut: t.session.dateDebut,
      dateFin: t.session.dateFin,
      lieu: t.session.lieu,
      horaires: t.session.horaires,
      status: t.session.status,
    },
    formation: {
      id: t.session.formation.id,
      code: t.session.formation.code,
      nomLong: t.session.formation.nomLong,
      configForm: t.session.formation.configForm,
      hasTemplateConvention: Boolean(t.session.formation.driveTemplateConventionId),
      hasTemplateContrat: Boolean(t.session.formation.driveTemplateContratId),
      hasTemplateConvocation: Boolean(t.session.formation.driveTemplateConvocationId),
    },
    events: t.events.map((e) => ({
      id: e.id,
      type: e.type,
      message: e.message,
      payload: e.payload,
      createdAt: e.createdAt,
    })),
    documents: t.documents.map((d) => ({
      id: d.id,
      type: d.type,
      fileName: d.fileName,
      driveFileId: d.driveFileId,
      driveFileUrl: d.driveFileUrl,
      generatedAt: d.generatedAt,
      sentAt: d.sentAt,
      signedAt: d.signedAt,
    })),
  };
}

export async function getTraineesBySession(sessionId: string): Promise<TraineeInfo[]> {
  const list = await prisma.trainee.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
  });
  return list.map(toInfo);
}

export async function createTrainee(input: TraineeCreateInput): Promise<TraineeInfo> {
  const t = await prisma.trainee.create({
    data: {
      sessionId: input.sessionId,
      nom: input.nom,
      prenom: input.prenom,
      email: input.email,
      telephone: input.telephone ?? "",
      inscriptionType: input.inscriptionType,
      raisonSociale: input.raisonSociale ?? "",
      siret: input.siret ?? "",
      adresseSiege: input.adresseSiege ?? "",
      domaineActivite: input.domaineActivite ?? "",
      contactAdmin: input.contactAdmin ?? "",
      adressePostale: input.adressePostale ?? "",
      statutActuel: input.statutActuel ?? "",
      modeFinancement: input.modeFinancement ?? "",
      opcoDetecte: input.opcoDetecte ?? "",
      psh: input.psh ?? false,
      besoinsAdaptation: input.besoinsAdaptation ?? "",
      evalEntree: input.evalEntree ?? "{}",
      attentes: input.attentes ?? "",
    },
  });
  return toInfo(t);
}

export interface TraineeUpdateInput {
  status?: string;
  nom?: string;
  prenom?: string;
  email?: string;
  telephone?: string;
  statutActuel?: string;
  modeFinancement?: string;
  raisonSociale?: string;
  siret?: string;
  adresseSiege?: string;
  domaineActivite?: string;
  contactAdmin?: string;
  adressePostale?: string;
  psh?: boolean;
  besoinsAdaptation?: string;
  attentes?: string;
  sellsyCompanyId?: number | null;
  sellsyIndividualId?: number | null;
  sellsyOpportunityId?: number | null;
  sellsyEstimateId?: number | null;
  driveFolderId?: string | null;
  dateEnvoiDevis?: Date | null;
  dateSignatureDevis?: Date | null;
  dateEnvoiConvention?: Date | null;
  dateSignatureConvention?: Date | null;
  dateConvocation?: Date | null;
}

export async function updateTrainee(id: string, input: TraineeUpdateInput): Promise<TraineeInfo> {
  const data: Record<string, unknown> = {};
  // Identité / contact
  if (input.nom !== undefined) data.nom = input.nom;
  if (input.prenom !== undefined) data.prenom = input.prenom;
  if (input.email !== undefined) data.email = input.email;
  if (input.telephone !== undefined) data.telephone = input.telephone;
  if (input.statutActuel !== undefined) data.statutActuel = input.statutActuel;
  if (input.modeFinancement !== undefined) data.modeFinancement = input.modeFinancement;
  // Entreprise
  if (input.raisonSociale !== undefined) data.raisonSociale = input.raisonSociale;
  if (input.siret !== undefined) data.siret = input.siret;
  if (input.adresseSiege !== undefined) data.adresseSiege = input.adresseSiege;
  if (input.domaineActivite !== undefined) data.domaineActivite = input.domaineActivite;
  if (input.contactAdmin !== undefined) data.contactAdmin = input.contactAdmin;
  // Particulier
  if (input.adressePostale !== undefined) data.adressePostale = input.adressePostale;
  // Accessibilité
  if (input.psh !== undefined) data.psh = input.psh;
  if (input.besoinsAdaptation !== undefined) data.besoinsAdaptation = input.besoinsAdaptation;
  // Attentes
  if (input.attentes !== undefined) data.attentes = input.attentes;
  // Statut + Sellsy + dates
  if (input.status !== undefined) data.status = input.status;
  if (input.sellsyCompanyId !== undefined) data.sellsyCompanyId = input.sellsyCompanyId;
  if (input.sellsyIndividualId !== undefined) data.sellsyIndividualId = input.sellsyIndividualId;
  if (input.sellsyOpportunityId !== undefined) data.sellsyOpportunityId = input.sellsyOpportunityId;
  if (input.sellsyEstimateId !== undefined) data.sellsyEstimateId = input.sellsyEstimateId;
  if (input.driveFolderId !== undefined) data.driveFolderId = input.driveFolderId;
  if (input.dateEnvoiDevis !== undefined) data.dateEnvoiDevis = input.dateEnvoiDevis;
  if (input.dateSignatureDevis !== undefined) data.dateSignatureDevis = input.dateSignatureDevis;
  if (input.dateEnvoiConvention !== undefined) data.dateEnvoiConvention = input.dateEnvoiConvention;
  if (input.dateSignatureConvention !== undefined) data.dateSignatureConvention = input.dateSignatureConvention;
  if (input.dateConvocation !== undefined) data.dateConvocation = input.dateConvocation;
  const t = await prisma.trainee.update({ where: { id }, data });
  return toInfo(t);
}

export async function recordTraineeEvent(
  traineeId: string,
  type: string,
  message: string,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await prisma.traineeEvent.create({
    data: {
      traineeId,
      type,
      message,
      payload: JSON.stringify(payload),
    },
  });
}

type TraineeRow = Awaited<ReturnType<typeof prisma.trainee.findUniqueOrThrow>>;

function toInfo(t: TraineeRow): TraineeInfo {
  return {
    id: t.id,
    sessionId: t.sessionId,
    status: t.status,
    nom: t.nom,
    prenom: t.prenom,
    email: t.email,
    telephone: t.telephone,
    inscriptionType: t.inscriptionType,
    raisonSociale: t.raisonSociale,
    siret: t.siret,
    adresseSiege: t.adresseSiege,
    domaineActivite: t.domaineActivite,
    contactAdmin: t.contactAdmin,
    adressePostale: t.adressePostale,
    statutActuel: t.statutActuel,
    modeFinancement: t.modeFinancement,
    opcoDetecte: t.opcoDetecte,
    idOpco: t.idOpco,
    statutDossierFinancement: t.statutDossierFinancement,
    montantHT: t.montantHT,
    psh: t.psh,
    besoinsAdaptation: t.besoinsAdaptation,
    sellsyCompanyId: t.sellsyCompanyId,
    sellsyIndividualId: t.sellsyIndividualId,
    sellsyOpportunityId: t.sellsyOpportunityId,
    sellsyEstimateId: t.sellsyEstimateId,
    driveFolderId: t.driveFolderId,
    evalEntree: t.evalEntree,
    attentes: t.attentes,
    dateEnvoiDevis: t.dateEnvoiDevis,
    dateSignatureDevis: t.dateSignatureDevis,
    dateEnvoiConvention: t.dateEnvoiConvention,
    dateSignatureConvention: t.dateSignatureConvention,
    dateConvocation: t.dateConvocation,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}
