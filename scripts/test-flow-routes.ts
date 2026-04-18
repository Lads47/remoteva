/**
 * Test E2E des routes publiques /api/flow/*
 * Démarre depuis un état propre, exécute le workflow complet EVA Capture,
 * puis vérifie sync-offline.
 */
import prisma from "../src/lib/db";
import { createApiKey } from "../src/lib/apiKey";
import { createFlowProject } from "../src/lib/flow";

const BASE = "http://localhost:3010/api/flow";

async function setup() {
  // Cleanup
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany({ where: { name: "TEST-RUNNER-KEY" } });

  const { plaintext } = await createApiKey("TEST-RUNNER-KEY");

  const project = await createFlowProject({
    title: "Journée de test E2E",
    date: new Date("2026-04-18T00:00:00Z"),
    location: "Paris",
    room: "Amphi A",
    director: "Paul Test",
    conferences: [
      { title: "Conf 1 — Ouverture", speaker: "Dr Alpha", scheduledStart: new Date("2026-04-18T09:00:00Z"), scheduledEnd: new Date("2026-04-18T10:00:00Z") },
      { title: "Conf 2 — Climat", speaker: "Pr Beta" },
    ],
  });

  return { apiKey: plaintext, project };
}

async function call(
  method: string,
  path: string,
  apiKey: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

function assertEq<T>(label: string, actual: T, expected: T) {
  if (actual !== expected) {
    console.error(`✗ ${label}: expected ${expected}, got ${actual}`);
    process.exit(1);
  }
  console.log(`✓ ${label}: ${actual}`);
}

async function main() {
  const { apiKey, project } = await setup();
  console.log(`Setup OK. Project ${project.eventId} (id=${project.id}) avec ${project.conferences.length} conférences\n`);

  console.log("=== 1. Auth ===");
  const noAuth = await fetch(`${BASE}/projects?date=2026-04-18`);
  assertEq("GET sans X-Api-Key", noAuth.status, 401);

  const badKey = await fetch(`${BASE}/projects?date=2026-04-18`, { headers: { "X-Api-Key": "evak_invalid" } });
  assertEq("GET avec mauvaise clé", badKey.status, 401);

  console.log("\n=== 2. GET /projects ===");
  const list = await call("GET", "/projects?date=2026-04-18", apiKey);
  assertEq("status", list.status, 200);
  assertEq("nb projects", list.data.projects.length, 1);
  assertEq("eventId", list.data.projects[0].eventId, project.eventId);

  console.log("\n=== 3. GET /projects?date=…&regie=WVP_A2 (filtre régie sans match) ===");
  const filtered = await call("GET", "/projects?date=2026-04-18&regie=WVP_A2", apiKey);
  assertEq("status", filtered.status, 200);
  assertEq("nb (régie pas encore set)", filtered.data.projects.length, 0);

  console.log("\n=== 4. GET /projects?regie=INVALID ===");
  const badRegie = await call("GET", "/projects?date=2026-04-18&regie=INVALID", apiKey);
  assertEq("status", badRegie.status, 400);

  console.log("\n=== 5. GET /projects/[id] ===");
  const detail = await call("GET", `/projects/${project.id}`, apiKey);
  assertEq("status", detail.status, 200);
  assertEq("eventId", detail.data.project.eventId, project.eventId);
  assertEq("nb conferences", detail.data.project.conferences.length, 2);

  console.log("\n=== 6. GET /projects/by-event-id/[eventId] ===");
  const byEid = await call("GET", `/projects/by-event-id/${project.eventId}`, apiKey);
  assertEq("status", byEid.status, 200);
  assertEq("title", byEid.data.project.title, "Journée de test E2E");

  console.log("\n=== 7. GET /projects/by-event-id/INVALID ===");
  const badEid = await call("GET", "/projects/by-event-id/notvalid", apiKey);
  assertEq("status (format invalide)", badEid.status, 400);

  console.log("\n=== 8. POST /projects/[id]/prepare ===");
  const prep = await call("POST", `/projects/${project.id}/prepare`, apiKey, {
    regie: "WVP_A2",
    director: "Paul Test",
    recordingLocalPath: "D:/REC/2026-04-18_test/",
  });
  assertEq("status", prep.status, 200);
  assertEq("régie", prep.data.project.regie, "WVP_A2");
  assertEq("path", prep.data.project.recordingLocalPath, "D:/REC/2026-04-18_test/");

  console.log("\n=== 9. POST /projects/[id]/prepare avec autre régie (écrase) ===");
  const reprep = await call("POST", `/projects/${project.id}/prepare`, apiKey, {
    regie: "WVP_A3",
    recordingLocalPath: "D:/REC/2026-04-18_v2/",
  });
  assertEq("status", reprep.status, 200);
  assertEq("régie écrasée", reprep.data.project.regie, "WVP_A3");

  // Re-prepare en WVP_A2 pour la suite
  await call("POST", `/projects/${project.id}/prepare`, apiKey, { regie: "WVP_A2" });

  console.log("\n=== 10. GET /projects?date=…&regie=WVP_A2 (maintenant match) ===");
  const filteredAfter = await call("GET", "/projects?date=2026-04-18&regie=WVP_A2", apiKey);
  assertEq("nb après prepare", filteredAfter.data.projects.length, 1);

  console.log("\n=== 11. POST /projects/[id]/conferences (conf imprévue) ===");
  const newConf = await call("POST", `/projects/${project.id}/conferences`, apiKey, {
    title: "Conf 3 — Imprévue",
    speaker: "Dr Gamma",
  });
  assertEq("status", newConf.status, 201);
  assertEq("order", newConf.data.conference.order, 3);

  console.log("\n=== 12. Workflow recording-started → stopped → uploaded ===");
  const c1Id = project.conferences[0].id;
  const start = await call("POST", `/conferences/${c1Id}/recording-started`, apiKey);
  assertEq("started status", start.status, 200);
  assertEq("conf status", start.data.conference.status, "recording");
  assertEq("project status", start.data.projectStatus, "recording");

  const stop = await call("POST", `/conferences/${c1Id}/recording-stopped`, apiKey, {
    localFolder: "conf01_ouverture/",
    durationSeconds: 3245,
  });
  assertEq("stopped status", stop.status, 200);
  assertEq("conf status", stop.data.conference.status, "ingest");
  assertEq("durée", stop.data.conference.durationSeconds, 3245);

  const upload = await call("POST", `/conferences/${c1Id}/uploaded`, apiKey);
  assertEq("uploaded status", upload.status, 200);
  assertEq("conf status", upload.data.conference.status, "ready_to_edit");

  console.log("\n=== 13. POST /conferences/[id]/not-captured ===");
  const c2Id = project.conferences[1].id;
  const nc = await call("POST", `/conferences/${c2Id}/not-captured`, apiKey);
  assertEq("status", nc.status, 200);
  assertEq("conf status", nc.data.conference.status, "not_captured");

  console.log("\n=== 14. POST /sync-offline (création depuis 0) ===");
  const off1 = await call("POST", "/sync-offline", apiKey, {
    project: {
      title: "Événement offline créé sur le terrain",
      date: "2026-04-19T00:00:00.000Z",
      location: "Lyon",
      room: "Salle B",
      director: "Tom Test",
      regie: "WVP_A1",
      recordingLocalPath: "D:/REC/2026-04-19_offline/",
      notes: "Créé hors ligne",
    },
    conferences: [
      { order: 1, title: "Conf offline 1", speaker: "Dr X", status: "ready_to_edit", localFolder: "conf01/", durationSeconds: 1800 },
      { order: 2, title: "Conf offline 2", speaker: "Dr Y", status: "ready_to_edit", localFolder: "conf02/", durationSeconds: 2400 },
    ],
  });
  assertEq("status", off1.status, 201);
  assertEq("merged", off1.data.merged, false);
  console.log(`  Created eventId: ${off1.data.project.eventId}`);
  const offlineEventId = off1.data.project.eventId;

  console.log("\n=== 15. POST /sync-offline (re-sync = merge sur eventId existant) ===");
  const off2 = await call("POST", "/sync-offline", apiKey, {
    project: {
      eventId: offlineEventId,
      title: "Événement offline créé sur le terrain (TITRE MIS A JOUR)",
      date: "2026-04-19T00:00:00.000Z",
      location: "Lyon",
      room: "Salle B",
      director: "Tom Test",
      regie: "WVP_A1",
    },
    conferences: [
      { order: 1, title: "Conf offline 1 - updated", speaker: "Dr X", status: "delivered" },
      { order: 2, title: "Conf offline 2", speaker: "Dr Y", status: "delivered" },
      { order: 3, title: "Conf offline 3 (nouvelle)", speaker: "Dr Z", status: "ready_to_edit" },
    ],
  });
  assertEq("status", off2.status, 200);
  assertEq("merged", off2.data.merged, true);
  assertEq("nb confs après merge", off2.data.project.conferences.length, 3);
  assertEq("title updated", off2.data.project.title, "Événement offline créé sur le terrain (TITRE MIS A JOUR)");

  console.log("\n=== 16. 404 sur conf inconnue ===");
  const notFound = await call("POST", "/conferences/cknotexists/uploaded", apiKey);
  assertEq("status", notFound.status, 404);

  console.log("\n=== 17. CORS preflight OPTIONS ===");
  const preflight = await fetch(`${BASE}/projects/${project.id}`, { method: "OPTIONS" });
  assertEq("OPTIONS status", preflight.status, 204);
  assertEq("CORS Allow-Origin", preflight.headers.get("access-control-allow-origin"), "*");

  // Cleanup
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany({ where: { name: "TEST-RUNNER-KEY" } });
  await prisma.$disconnect();

  console.log("\n✅ Tous les tests E2E des routes /api/flow/* passent");
}

main().catch((err) => { console.error("FAIL:", err); process.exit(1); });
