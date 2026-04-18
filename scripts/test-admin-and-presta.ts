/**
 * Test des routes admin + presta.
 * Pour les routes admin (auth NextAuth/cookies), on appelle directement les helpers + lib (test unitaire).
 * Pour les routes presta (token-based), on teste via fetch HTTP.
 */
import prisma from "../src/lib/db";
import { createDirector, getDirectorByToken, toggleAvailability, getAvailableDirectorsForDate } from "../src/lib/director";
import { createApiKey, listApiKeys, verifyApiKey, revokeApiKey } from "../src/lib/apiKey";
import { createFlowProject, prepareProject, refreshProjectStatus } from "../src/lib/flow";
import { markRecordingStarted, markRecordingStopped, markUploaded } from "../src/lib/conference";
import { buildMagicLink } from "../src/lib/email";

const PRESTA_BASE = "http://localhost:3010/api/presta";

async function clean() {
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();
}

function check(label: string, ok: boolean, detail?: string) {
  if (!ok) {
    console.error(`✗ ${label}` + (detail ? ` (${detail})` : ""));
    process.exit(1);
  }
  console.log(`✓ ${label}`);
}

async function main() {
  await clean();

  console.log("\n=== A. Director helpers (utilisés par /api/admin/directors) ===");
  const dir = await createDirector({ name: "Tom Director", email: "tom@test.fr", phone: "06" });
  check("createDirector", !!dir.id);
  check("magicToken length 64", dir.magicToken.length === 64);
  check("magic link build", buildMagicLink(dir.magicToken).includes("/presta?token="));

  console.log("\n=== B. ApiKey helpers (utilisés par /api/admin/api-keys) ===");
  const { apiKey, plaintext } = await createApiKey("Test Key");
  check("createApiKey", !!apiKey.id);
  check("plaintext starts evak_", plaintext.startsWith("evak_"));
  const verified = await verifyApiKey(plaintext);
  check("verifyApiKey OK", verified?.id === apiKey.id);
  await revokeApiKey(apiKey.id);
  const verifiedAfter = await verifyApiKey(plaintext);
  check("verifyApiKey après revoke = null", verifiedAfter === null);
  const list = await listApiKeys();
  check("listApiKeys retourne 1 entrée révoquée", list.length === 1 && list[0].revoked === true);

  console.log("\n=== C. Project + assign-director flow (utilisé par /api/admin/flow/[id]/assign-director) ===");
  const project = await createFlowProject({
    title: "Journée test",
    date: new Date("2026-04-25T00:00:00Z"),
    location: "Paris",
    room: "A",
    conferences: [
      { title: "Conf 1", speaker: "X", scheduledStart: new Date("2026-04-25T09:00:00Z"), scheduledEnd: new Date("2026-04-25T10:00:00Z") },
    ],
  });
  check("createFlowProject avec conf", project.conferences.length === 1);
  check("eventId généré", project.eventId === "250426-001");

  // Marque dispo + check getAvailableDirectorsForDate
  await toggleAvailability(dir.id, "2026-04-25");
  const available = await getAvailableDirectorsForDate("2026-04-25");
  check("Director apparaît dispo", available.length === 1 && available[0].id === dir.id);

  // Simule l'assign : update project.directorId + project.director (l'envoi d'email est testé séparément en intégration)
  await prisma.flowProject.update({
    where: { id: project.id },
    data: { directorId: dir.id, director: dir.name },
  });
  const updated = await prisma.flowProject.findUnique({
    where: { id: project.id },
    include: { assignedDirector: true },
  });
  check("Director assigné", updated?.assignedDirector?.name === "Tom Director");

  console.log("\n=== D. Routes presta (via HTTP) ===");
  // GET /presta/me sans token
  const noTok = await fetch(`${PRESTA_BASE}/me`);
  check("GET /me sans token → 400", noTok.status === 400);

  // GET /presta/me avec mauvais token
  const badTok = await fetch(`${PRESTA_BASE}/me?token=zzz`);
  check("GET /me avec mauvais token → 401", badTok.status === 401);

  // GET /presta/me avec bon token
  const me = await fetch(`${PRESTA_BASE}/me?token=${dir.magicToken}`);
  check("GET /me OK → 200", me.status === 200);
  const meData = await me.json();
  check("GET /me renvoie director", meData.director?.name === "Tom Director");
  check("GET /me renvoie 1 dispo (du test C)", Array.isArray(meData.availableDates) && meData.availableDates.length === 1);

  // POST /presta/availability — toggle (supprime la dispo existante)
  const toggle1 = await fetch(`${PRESTA_BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: dir.magicToken, date: "2026-04-25T00:00:00.000Z" }),
  });
  const t1 = await toggle1.json();
  check("Toggle 1 supprime dispo existante", t1.created === false && t1.availableDates.length === 0);

  // POST availability — recrée
  const toggle2 = await fetch(`${PRESTA_BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: dir.magicToken, date: "2026-04-25T00:00:00.000Z" }),
  });
  const t2 = await toggle2.json();
  check("Toggle 2 recrée dispo", t2.created === true && t2.availableDates.length === 1);

  // POST availability — autre date
  const toggle3 = await fetch(`${PRESTA_BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: dir.magicToken, date: "2026-04-26T00:00:00.000Z" }),
  });
  const t3 = await toggle3.json();
  check("Toggle 3 ajoute autre date", t3.created === true && t3.availableDates.length === 2);

  // DELETE availability
  const del = await fetch(`${PRESTA_BASE}/availability`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: dir.magicToken, date: "2026-04-26T00:00:00.000Z" }),
  });
  const dData = await del.json();
  check("DELETE availability retire la date", dData.availableDates.length === 1);

  // DELETE availability avec mauvais token
  const badDel = await fetch(`${PRESTA_BASE}/availability`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: "wrong", date: "2026-04-25T00:00:00.000Z" }),
  });
  check("DELETE bad token → 401", badDel.status === 401);

  // POST availability sans body valide
  const noBody = await fetch(`${PRESTA_BASE}/availability`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  check("POST availability validation → 400", noBody.status === 400);

  await clean();
  await prisma.$disconnect();
  console.log("\n✅ Tous les tests admin + presta passent");
}

main().catch((err) => { console.error("FAIL:", err); process.exit(1); });
