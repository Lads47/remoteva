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
