import prisma from "./db";

export interface FormationInfo {
  id: string;
  code: string;
  nomLong: string;
  description: string;
  prixHT: number;
  dureeJours: number;
  active: boolean;
  // Seuil d'inscrits confirmant la formation → envoi auto du contrat ST (0 = off)
  minInscrits: number;

  sellsyPipelineId: number | null;
  sellsyStepInitial: number | null;
  sellsyServiceId: number | null;
  sellsyEstimateModelId: number | null;
  codeOpportunite: string;

  driveDossierRacineId: string | null;
  driveDossierSessionsId: string | null;
  driveTemplateProgrammeId: string | null;
  driveTemplateConventionId: string | null;
  driveTemplateContratId: string | null;
  driveTemplateConvocationId: string | null;
  driveTemplateEmargementId: string | null;
  driveTemplateSuiviId: string | null;

  configForm: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FormationCreateInput {
  code: string;
  nomLong: string;
  description?: string;
  prixHT: number;
  dureeJours: number;
  active?: boolean;
  minInscrits?: number;
  sellsyPipelineId?: number | null;
  sellsyStepInitial?: number | null;
  sellsyServiceId?: number | null;
  sellsyEstimateModelId?: number | null;
  codeOpportunite?: string;
  driveDossierRacineId?: string | null;
  driveDossierSessionsId?: string | null;
  driveTemplateProgrammeId?: string | null;
  driveTemplateConventionId?: string | null;
  driveTemplateContratId?: string | null;
  driveTemplateConvocationId?: string | null;
  driveTemplateEmargementId?: string | null;
  driveTemplateSuiviId?: string | null;
  configForm?: string;
}

export type FormationUpdateInput = Partial<FormationCreateInput>;

export async function getAllFormations(): Promise<FormationInfo[]> {
  const list = await prisma.formation.findMany({ orderBy: { code: "asc" } });
  return list.map(toInfo);
}

export async function getActiveFormations(): Promise<FormationInfo[]> {
  const list = await prisma.formation.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
  });
  return list.map(toInfo);
}

export async function getFormationById(id: string): Promise<FormationInfo | null> {
  const f = await prisma.formation.findUnique({ where: { id } });
  return f ? toInfo(f) : null;
}

export async function getFormationByCode(code: string): Promise<FormationInfo | null> {
  const f = await prisma.formation.findUnique({ where: { code } });
  return f ? toInfo(f) : null;
}

export async function createFormation(input: FormationCreateInput): Promise<FormationInfo> {
  const f = await prisma.formation.create({ data: input });
  return toInfo(f);
}

export async function updateFormation(id: string, input: FormationUpdateInput): Promise<FormationInfo> {
  const f = await prisma.formation.update({ where: { id }, data: input });
  return toInfo(f);
}

export async function deleteFormation(id: string): Promise<void> {
  await prisma.formation.delete({ where: { id } });
}

type FormationRow = Awaited<ReturnType<typeof prisma.formation.findUniqueOrThrow>>;

function toInfo(f: FormationRow): FormationInfo {
  return {
    id: f.id,
    code: f.code,
    nomLong: f.nomLong,
    description: f.description,
    prixHT: f.prixHT,
    dureeJours: f.dureeJours,
    active: f.active,
    minInscrits: f.minInscrits,
    sellsyPipelineId: f.sellsyPipelineId,
    sellsyStepInitial: f.sellsyStepInitial,
    sellsyServiceId: f.sellsyServiceId,
    sellsyEstimateModelId: f.sellsyEstimateModelId,
    codeOpportunite: f.codeOpportunite,
    driveDossierRacineId: f.driveDossierRacineId,
    driveDossierSessionsId: f.driveDossierSessionsId,
    driveTemplateProgrammeId: f.driveTemplateProgrammeId,
    driveTemplateConventionId: f.driveTemplateConventionId,
    driveTemplateContratId: f.driveTemplateContratId,
    driveTemplateConvocationId: f.driveTemplateConvocationId,
    driveTemplateEmargementId: f.driveTemplateEmargementId,
    driveTemplateSuiviId: f.driveTemplateSuiviId,
    configForm: f.configForm,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  };
}
