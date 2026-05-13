// Détection OPCO best-effort via le SIRET (API recherche-entreprises.gouv).
// Reprise du mapping APE → OPCO du workflow n8n.

const API_URL = "https://recherche-entreprises.api.gouv.fr/search";

export interface OpcoDetectionResult {
  opco: string;                  // Code OPCO (AFDAS, ATLAS, ...) ou "GENERIQUE" si inconnu
  ape: string | null;            // Code APE / NAF retourné
  idcc: string[];                // IDCC convention collective si disponibles
  raisonSocialeApi: string | null;
}

export async function detectOpcoBySiret(siret: string): Promise<OpcoDetectionResult> {
  const clean = siret.replace(/\s+/g, "");
  if (!/^\d{14}$/.test(clean)) {
    return { opco: "GENERIQUE", ape: null, idcc: [], raisonSocialeApi: null };
  }

  try {
    const res = await fetch(`${API_URL}?q=${clean}`, {
      headers: { Accept: "application/json" },
      // Pas de cache : on veut la donnée à jour à chaque inscription
      cache: "no-store",
    });
    if (!res.ok) {
      return { opco: "GENERIQUE", ape: null, idcc: [], raisonSocialeApi: null };
    }
    const data = (await res.json()) as {
      results?: Array<{
        activite_principale?: string;
        nom_complet?: string;
        complements?: { liste_idcc?: string[] };
      }>;
    };
    const entry = data.results?.[0];
    if (!entry) {
      return { opco: "GENERIQUE", ape: null, idcc: [], raisonSocialeApi: null };
    }
    const ape = entry.activite_principale ?? null;
    const idcc = entry.complements?.liste_idcc ?? [];
    return {
      opco: mapApeToOpco(ape, idcc),
      ape,
      idcc,
      raisonSocialeApi: entry.nom_complet ?? null,
    };
  } catch {
    return { opco: "GENERIQUE", ape: null, idcc: [], raisonSocialeApi: null };
  }
}

// Mapping APE / IDCC → OPCO. Liste alignée sur le code JS du workflow n8n.
// Reste best-effort : si rien ne matche, on renvoie GENERIQUE.
function mapApeToOpco(ape: string | null, idcc: string[]): string {
  if (!ape) return "GENERIQUE";
  const startsWithAny = (...prefixes: string[]) => prefixes.some((p) => ape.startsWith(p));

  // AFDAS — secteur audiovisuel/spectacle (incluant IDCC 2642 = audiovisuel)
  if (idcc.includes("2642") || startsWithAny("59", "60", "90", "91")) return "AFDAS";
  // ATLAS — services financiers / conseil
  if (startsWithAny("62", "63", "64", "65", "66", "70")) return "ATLAS";
  // AKTO — hôtellerie-restauration / commerce de détail alimentaire
  if (startsWithAny("47", "55", "56")) return "AKTO";
  // CONSTRUCTYS — BTP
  if (startsWithAny("41", "42", "43")) return "CONSTRUCTYS";
  // OPCO_EP — santé / action sociale / éducation
  if (startsWithAny("85", "86", "87", "88")) return "OPCO_EP";
  // OPCO_MOBILITES — transport / logistique
  if (startsWithAny("45", "49", "50", "52")) return "OPCO_MOBILITES";
  // UNIFORMATION — économie sociale
  if (startsWithAny("94")) return "UNIFORMATION";
  // OCAPIAT — agriculture / agroalimentaire
  if (startsWithAny("01", "02", "03", "10", "11", "12")) return "OCAPIAT";
  // OPCO_2I — industrie
  if (
    startsWithAny(
      "13", "14", "15", "16", "17", "18", "19",
      "20", "21", "22", "23", "24", "25", "26", "27", "28", "29",
      "30", "31", "32", "33"
    )
  )
    return "OPCO_2I";
  // OPCOMMERCE — commerce de gros
  if (startsWithAny("46")) return "OPCOMMERCE";
  // FIF_PL — professions libérales
  if (startsWithAny("69", "71", "73", "74") || ape.startsWith("85.59")) return "FIF_PL";

  return "GENERIQUE";
}
