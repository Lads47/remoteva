"use client";

// === EVA MASTER — marquage local-first (IndexedDB) ===
//
// RÈGLE CRITIQUE (CDC §5.5) : chaque clic de marquage écrit D'ABORD ici, dans
// le navigateur de la régie. C'est la SOURCE DE VÉRITÉ. Aucune connexion
// permanente n'est requise ; le marquage fonctionne hors-ligne. Le serveur ne
// reçoit une copie qu'au clic manuel « envoyer à EVA Core ». `dirty = true`
// signale un marquage pas encore envoyé (compteur « N à envoyer »).

const DB_NAME = "eva-master";
const DB_VERSION = 1;
const STORE = "markings";

export type LocalMarking = {
  conferenceId: string; // clé
  prestaId: string; // index
  startedAt: string | null; // ISO
  endedAt: string | null; // ISO
  status: string; // pending | recording | done | cancelled
  dirty: boolean; // true = à envoyer
  updatedAt: number; // ms epoch (tri / debug)
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "conferenceId" });
        store.createIndex("prestaId", "prestaId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode) {
  return db.transaction(STORE, mode).objectStore(STORE);
}

// Tous les marquages locaux d'une presta.
export async function getLocalMarkings(prestaId: string): Promise<LocalMarking[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readonly");
    const index = store.index("prestaId");
    const req = index.getAll(IDBKeyRange.only(prestaId));
    req.onsuccess = () => resolve(req.result as LocalMarking[]);
    req.onerror = () => reject(req.error);
  });
}

// Écrit / remplace un marquage (toujours dirty=true après une action régie).
export async function putLocalMarking(m: LocalMarking): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").put(m);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// Après un envoi réussi : passe les marquages concernés à dirty=false.
export async function clearDirtyFlags(conferenceIds: string[]): Promise<void> {
  if (conferenceIds.length === 0) return;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const store = tx(db, "readwrite");
    let remaining = conferenceIds.length;
    conferenceIds.forEach((id) => {
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const m = getReq.result as LocalMarking | undefined;
        if (m) {
          m.dirty = false;
          store.put(m);
        }
        remaining -= 1;
        if (remaining === 0) resolve();
      };
      getReq.onerror = () => reject(getReq.error);
    });
  });
}

// Retire un marquage local (conf supprimée).
export async function deleteLocalMarking(conferenceId: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = tx(db, "readwrite").delete(conferenceId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
