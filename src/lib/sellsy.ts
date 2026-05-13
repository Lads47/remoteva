// Client Sellsy API v2 — OAuth2 client_credentials.
// Doc : https://api.sellsy.com/doc/v2/
//
// Variables d'environnement requises :
// - SELLSY_CLIENT_ID
// - SELLSY_CLIENT_SECRET

const TOKEN_URL = "https://login.sellsy.com/oauth2/access-tokens";
const API_BASE = "https://api.sellsy.com/v2";

// Cache mémoire du token : on évite d'appeler le token endpoint à chaque requête.
// Sellsy renvoie un access_token avec un expires_in (typiquement 3600s = 1h).
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  // Marge de 30s avant expiration pour éviter une 401 en bordure
  if (cachedToken && cachedToken.expiresAt > now + 30_000) {
    return cachedToken.value;
  }
  const clientId = process.env.SELLSY_CLIENT_ID;
  const clientSecret = process.env.SELLSY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("SELLSY_CLIENT_ID ou SELLSY_CLIENT_SECRET manquant dans .env");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Sellsy auth failed (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

interface SellsyFetchOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

/**
 * Wrapper bas niveau pour appeler l'API Sellsy v2.
 * Gère le token + sérialisation JSON + erreurs HTTP.
 */
export async function sellsyFetch<T = unknown>(
  path: string,
  options: SellsyFetchOptions = {}
): Promise<T> {
  const token = await getAccessToken();
  const url = new URL(API_BASE + path);
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method: options.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Sellsy ${options.method ?? "GET"} ${path} failed (HTTP ${res.status}): ${errText.slice(0, 400)}`);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// === Types Sellsy partiels (que ce dont on a besoin) ===

// Sellsy peut retourner soit `label`, soit `name` selon la ressource.
// Les types ci-dessous sont permissifs et normalisés par les fonctions métier.
interface SellsyPipelineRaw {
  id: number;
  label?: string;
  name?: string;
}

interface SellsyStepRaw {
  id: number;
  label?: string;
  name?: string;
  probability?: number;
  rank?: number;
  pipeline_id?: number;
  pipeline?: { id: number };
}

export interface SellsyPipeline {
  id: number;
  label: string;
}

export interface SellsyStep {
  id: number;
  label: string;
  probability?: number;
  rank?: number;
}

interface PaginatedResponse<T> {
  data: T[];
  pagination?: { count?: number; total?: number };
}

// === Endpoints métier ===

/**
 * Liste les pipelines d'opportunités du compte Sellsy.
 * Endpoint Sellsy v2 : GET /opportunities/pipelines
 */
export async function listPipelines(): Promise<SellsyPipeline[]> {
  const res = await sellsyFetch<PaginatedResponse<SellsyPipelineRaw>>("/opportunities/pipelines", {
    query: { limit: 100 },
  });
  return (res.data || []).map((p) => ({
    id: p.id,
    label: p.label || p.name || `Pipeline ${p.id}`,
  }));
}

/**
 * Récupère les steps d'un pipeline donné.
 * Endpoint Sellsy v2 : POST /opportunities/steps/search avec body { filters: { funnel: <pipelineId> } }.
 * Sellsy garde la nomenclature historique "funnel" pour désigner un pipeline d'opportunités.
 */
export async function listPipelineSteps(pipelineId: number): Promise<SellsyStep[]> {
  const res = await sellsyFetch<PaginatedResponse<SellsyStepRaw>>("/opportunities/steps/search", {
    method: "POST",
    body: { filters: { funnel: pipelineId } },
  });
  return (res.data || []).map(normalizeStep).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
}

function normalizeStep(s: SellsyStepRaw): SellsyStep {
  return {
    id: s.id,
    label: s.name || s.label || `Étape ${s.id}`,
    probability: s.probability,
    rank: s.rank,
  };
}

// === Companies / Individuals / Adresses ===

export interface CreateCompanyInput {
  name: string;
  siret?: string;
  email?: string;
  phoneNumber?: string;
}

export interface SellsyCompany {
  id: number;
  name?: string;
}

export async function createCompany(input: CreateCompanyInput): Promise<SellsyCompany> {
  const body: Record<string, unknown> = {
    type: "prospect",
    name: input.name,
    email: input.email,
    phone_number: input.phoneNumber,
  };
  if (input.siret) {
    body.legal_france = { siret: input.siret.replace(/\s+/g, "") };
  }
  return sellsyFetch<SellsyCompany>("/companies", { method: "POST", body });
}

export interface CreateIndividualInput {
  firstName: string;
  lastName: string;
  email?: string;
  phoneNumber?: string;
}

export interface SellsyIndividual {
  id: number;
  first_name?: string;
  last_name?: string;
}

export async function createIndividual(input: CreateIndividualInput): Promise<SellsyIndividual> {
  const body = {
    type: "prospect",
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone_number: input.phoneNumber,
  };
  return sellsyFetch<SellsyIndividual>("/individuals", { method: "POST", body });
}

export interface AddAddressInput {
  name: string;
  addressLine1: string;
  postalCode: string;
  city: string;
}

export async function addCompanyAddress(companyId: number, input: AddAddressInput): Promise<{ id: number }> {
  return sellsyFetch<{ id: number }>(`/companies/${companyId}/addresses`, {
    method: "POST",
    body: {
      name: input.name,
      address_line_1: input.addressLine1,
      postal_code: input.postalCode,
      city: input.city,
      country_code: "FR",
      is_invoicing_address: true,
      is_delivery_address: true,
    },
  });
}

export async function addIndividualAddress(individualId: number, input: AddAddressInput): Promise<{ id: number }> {
  return sellsyFetch<{ id: number }>(`/individuals/${individualId}/addresses`, {
    method: "POST",
    body: {
      name: input.name,
      address_line_1: input.addressLine1,
      postal_code: input.postalCode,
      city: input.city,
      country_code: "FR",
      is_invoicing_address: true,
      is_delivery_address: true,
    },
  });
}

// === Opportunities ===

export interface CreateOpportunityInput {
  name: string;
  pipelineId: number;
  stepId: number;
  relatedType: "company" | "individual";
  relatedId: number;
}

export interface SellsyOpportunity {
  id: number;
  name?: string;
  step?: { id: number };
}

export async function createOpportunity(input: CreateOpportunityInput): Promise<SellsyOpportunity> {
  return sellsyFetch<SellsyOpportunity>("/opportunities", {
    method: "POST",
    body: {
      name: input.name,
      pipeline: input.pipelineId,
      step: input.stepId,
      related: [{ type: input.relatedType, id: input.relatedId }],
    },
  });
}

export async function updateOpportunityStep(opportunityId: number, stepId: number): Promise<void> {
  // Sellsy v2 utilise PATCH pour les updates partiels
  await sellsyFetch<unknown>(`/opportunities/${opportunityId}`, {
    method: "PATCH",
    body: { step: stepId },
  });
}

// === Estimates (devis) ===

export interface CreateEstimateInput {
  subject: string;
  serviceId: number;
  unitAmountHT: number;
  quantity?: number;
  relatedType: "company" | "individual";
  relatedId: number;
  opportunityId: number;
}

export interface SellsyEstimate {
  id: number;
  pdf_link?: string;
  public_link?: string;
}

export async function createEstimate(input: CreateEstimateInput): Promise<SellsyEstimate> {
  return sellsyFetch<SellsyEstimate>("/estimates", {
    method: "POST",
    body: {
      subject: input.subject,
      rows: [
        {
          type: "catalog",
          related: { type: "service", id: input.serviceId },
          unit_amount: String(input.unitAmountHT),
          quantity: String(input.quantity ?? 1),
        },
      ],
      related: [
        { type: input.relatedType, id: input.relatedId },
        { type: "opportunity", id: input.opportunityId },
      ],
    },
  });
}

/**
 * Récupère un devis (avec son lien PDF).
 */
export async function getEstimate(id: number): Promise<SellsyEstimate> {
  return sellsyFetch<SellsyEstimate>(`/estimates/${id}`);
}

/**
 * Télécharge le PDF d'un devis depuis Sellsy.
 * Sellsy peut prendre quelques secondes à générer le PDF après création du devis.
 * On retente jusqu'à 4 fois (~6s total) en re-fetchant le devis à chaque essai
 * pour récupérer une URL signée fraîche (les `key` du pdf_link peuvent être courtes).
 */
export async function downloadEstimatePdf(estimateId: number): Promise<{ buffer: Buffer; filename: string }> {
  const delays = [0, 1000, 2000, 3000]; // 0 + 1 + 2 + 3 = ~6s max
  let lastErr = "";
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await new Promise((r) => setTimeout(r, delays[i]));
    try {
      const estimate = await getEstimate(estimateId);
      if (!estimate.pdf_link) {
        lastErr = "pdf_link absent dans la réponse";
        continue;
      }
      const res = await fetch(estimate.pdf_link, { cache: "no-store" });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), filename: `devis-${estimateId}.pdf` };
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err instanceof Error ? err.message : "Unknown error";
    }
  }
  throw new Error(`Échec téléchargement PDF devis ${estimateId} après ${delays.length} essais : ${lastErr}`);
}
