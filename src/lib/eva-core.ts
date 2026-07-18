// === Contrat EVA CORE (STUBBÉ EN V1) ===
//
// EVA CORE vit sur le PC studio (local, GPU) — transcription, diarisation,
// résumés. evaremote communique avec lui par API (à définir). Tant que cette
// API n'existe pas, ce module fournit des IMPLÉMENTATIONS SIMULÉES pour que
// toute la page presta soit développable et testable sans EVA CORE en ligne.
//
// ⚠️ Les 3 fonctions ci-dessous sont le SEUL point de contact avec EVA CORE.
// Quand EVA CORE sera branché, on remplace l'intérieur par de vrais appels
// réseau — la signature (le contrat) ne change pas.

// --- Types du contrat ---

export type CoreConference = {
  externalId: string; // identifiant EVA CORE (clé de réconciliation)
  position: number; // ordre planifié
  title: string;
  speakers: string[]; // intervenants issus du sheet Drive
  status: "planned" | "cancelled"; // état côté sheet
};

export type CoreMarkingItem = {
  conferenceId: string; // id MasterConference côté evaremote
  externalId: string | null; // id EVA CORE si connu
  startedAt: string | null; // ISO
  endedAt: string | null; // ISO
  status: string;
};

export type CoreSendPayload = {
  prestaId: string;
  prestaSlug: string;
  markings: CoreMarkingItem[];
  logFilenames: string[]; // noms des .log vMix joints (destinés au module XML)
};

// Réponse de synchro : EVA CORE compare avec sa propre liste et renvoie
// une liste de confs à jour (ajoutées / supprimées / déplacées côté sheet).
export type CoreSyncResult = {
  ok: boolean;
  conferences: CoreConference[];
  message: string;
};

export type CoreDriveResult = {
  ok: boolean;
  status: "read" | "pending" | "error";
  message: string; // ex "lu · lexique + jingles prêts"
};

// --- Implémentations stub ---

// Petite liste de confs simulée (comme si EVA CORE avait lu le sheet Drive).
// Sert à peupler une presta pour le dev/démo. Déterministe.
const STUB_CONFERENCES: Omit<CoreConference, "externalId">[] = [
  { position: 1, title: "Présentation et introduction", speakers: ["Intervenant A"], status: "planned" },
  { position: 2, title: "Enjeux de la transformation écologique", speakers: ["Intervenant B", "Intervenant C"], status: "planned" },
  { position: 3, title: "Table ronde — rénovation des bâtiments", speakers: ["Intervenant D", "Intervenant E"], status: "planned" },
  { position: 4, title: "Déclinaison opérationnelle", speakers: ["Intervenant F"], status: "planned" },
  { position: 5, title: "Retours d'expérience terrain", speakers: ["Intervenant G"], status: "planned" },
  { position: 6, title: "Clôture et perspectives", speakers: ["Intervenant A"], status: "planned" },
];

// Envoie le lien Drive à EVA CORE pour lecture (lexique + jingles).
// STUB : simule une lecture réussie.
export async function sendDriveLink(driveUrl: string): Promise<CoreDriveResult> {
  void driveUrl;
  return {
    ok: true,
    status: "read",
    message: "lu · lexique + jingles prêts",
  };
}

// Demande à EVA CORE la liste des confs d'une presta (lecture du sheet).
// STUB : renvoie la liste simulée avec des externalId déterministes.
export async function fetchConferences(prestaSlug: string): Promise<CoreConference[]> {
  return STUB_CONFERENCES.map((c) => ({
    ...c,
    externalId: `${prestaSlug}-c${c.position}`,
  }));
}

// Envoie marquage + logs à EVA CORE, reçoit la liste de confs à jour.
// STUB : renvoie la liste simulée (aucune modif côté sheet) et un message OK.
export async function sendMarkingAndLogs(payload: CoreSendPayload): Promise<CoreSyncResult> {
  return {
    ok: true,
    conferences: await fetchConferences(payload.prestaSlug),
    message: `Reçu : ${payload.markings.length} marquage(s), ${payload.logFilenames.length} log(s).`,
  };
}
