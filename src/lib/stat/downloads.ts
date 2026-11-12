import { createHash } from "node:crypto";
import { isbot } from "isbot";
import db from "./db";
import { parisDay } from "./util";

// Téléchargements complets d'EVAPILOT depuis evadif.com, lus dans le journal dédié du
// canal nginx (format « telechargement », sans IP), une ligne par requête d'installeur :
//   $time_iso8601 \t $request_method \t $uri \t $status \t $body_bytes_sent \t $request_completion \t $http_user_agent

export const SITES_AVEC_TELECHARGEMENTS = ["evadif"];
const INSTALLEUR = /^\/eva-pilot\/(EvaPilot-Setup-(\d+\.\d+\.\d+)\.exe)$/;

export interface Telechargement {
  id: string;
  at: Date;
  file: string;
  version: string;
}

// null = ligne à ignorer : interrompue, partielle, mise à jour du logiciel, robot, autre fichier.
export function parseLigne(ligne: string): Telechargement | null {
  const champs = ligne.replace(/\r$/, "").split("\t");
  if (champs.length < 7) return null;
  const [quand, methode, uri, statut, , fin, ...ua] = champs;
  const agent = ua.join("\t").trim();
  const m = INSTALLEUR.exec(uri);
  if (!m || methode !== "GET" || statut !== "200" || fin !== "OK") return null;
  // Le logiciel télécharge ses mises à jour sans en-tête User-Agent (nginx note « - ») :
  // seuls les navigateurs comptent, robots exclus.
  if (!agent || agent === "-" || isbot(agent)) return null;
  const at = new Date(quand);
  if (Number.isNaN(at.getTime())) return null;
  const id = createHash("sha256").update(ligne).digest("hex").slice(0, 32);
  return { id, at, file: m[1], version: m[2] };
}

export async function enregistrer(siteId: string, texte: string): Promise<{ lues: number; comptees: number; nouvelles: number }> {
  const lignes = texte.split("\n").filter((l) => l.trim());
  let comptees = 0;
  let nouvelles = 0;
  for (const ligne of lignes) {
    const t = parseLigne(ligne);
    if (!t) continue;
    comptees++;
    const deja = await db.statDownload.findUnique({ where: { id: t.id }, select: { id: true } });
    if (deja) continue;
    await db.statDownload.create({
      data: { id: t.id, siteId, day: parisDay(t.at), at: t.at, file: t.file, version: t.version },
    });
    nouvelles++;
  }
  return { lues: lignes.length, comptees, nouvelles };
}

export async function compterTelechargements(siteId: string, now = new Date()): Promise<{ today: number; total: number }> {
  const [today, total] = await Promise.all([
    db.statDownload.count({ where: { siteId, day: parisDay(now) } }),
    db.statDownload.count({ where: { siteId } }),
  ]);
  return { today, total };
}
