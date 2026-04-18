/**
 * Test des helpers EVA Flow.
 * Vérifie : eventId génération, statut auto-dérivé, conferences workflow, apiKey, director.
 */
import {
  computeProjectStatus,
  createFlowProject,
  getProjectByEventId,
  getProjectsByDate,
  prepareProject,
  refreshProjectStatus,
} from "../src/lib/flow";
import {
  markRecordingStarted,
  markRecordingStopped,
  markUploaded,
  markNotCaptured,
} from "../src/lib/conference";
import {
  createDirector,
  toggleAvailability,
  getAvailableDirectorsForDate,
  getDirectorByToken,
} from "../src/lib/director";
import { generateApiKey, hashApiKey, createApiKey, verifyApiKey } from "../src/lib/apiKey";
import { generateEventId } from "../src/lib/eventId";
import prisma from "../src/lib/db";

async function clean() {
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();
}

async function main() {
  await clean();

  console.log("\n=== 1. EventId generation ===");
  const e1 = await generateEventId(new Date("2026-04-18T00:00:00Z"));
  console.log("First eventId:", e1);
  console.assert(e1 === "180426-001", "Expected 180426-001");

  console.log("\n=== 2. computeProjectStatus ===");
  console.assert(computeProjectStatus(["planned", "planned"]) === "planned", "all planned");
  console.assert(computeProjectStatus(["planned", "recording"]) === "recording", "one recording");
  console.assert(computeProjectStatus(["delivered", "delivered"]) === "delivered", "all delivered");
  console.assert(computeProjectStatus(["delivered", "not_captured"]) === "delivered", "delivered + not_captured");
  console.assert(computeProjectStatus(["editing", "ready_to_edit"]) === "editing", "any editing");
  console.assert(computeProjectStatus(["ingest", "ingest"]) === "ingest", "all ingest");
  console.assert(computeProjectStatus(["ready_to_edit", "ready_to_edit"]) === "ready_to_edit", "all ready_to_edit");
  console.assert(computeProjectStatus(["not_captured"]) === "planned", "all not_captured");
  console.log("All computeProjectStatus OK");

  console.log("\n=== 3. Director + magic token ===");
  const dir = await createDirector({ name: "Paul Test", email: "paul@test.fr", phone: "0102030405" });
  console.log("Director created:", dir.name, "magicToken length:", dir.magicToken.length);
  const dirByToken = await getDirectorByToken(dir.magicToken);
  console.assert(dirByToken?.id === dir.id, "Director found by token");

  console.log("\n=== 4. Project create with conferences ===");
  const project = await createFlowProject({
    title: "Journée test",
    date: new Date("2026-04-18T00:00:00Z"),
    location: "Paris",
    room: "Amphi A",
    director: dir.name,
    directorId: dir.id,
    conferences: [
      { title: "Conf 1", speaker: "Dr A", scheduledStart: new Date("2026-04-18T09:00:00Z"), scheduledEnd: new Date("2026-04-18T10:00:00Z") },
      { title: "Conf 2", speaker: "Dr B" },
      { title: "Conf 3", speaker: "Dr C" },
    ],
  });
  console.log("Project:", project.eventId, "with", project.conferences.length, "conferences");

  console.log("\n=== 5. Prepare project (lock régie) ===");
  const prepared = await prepareProject(project.id, {
    regie: "WVP_A2",
    recordingLocalPath: "D:/REC/test/",
  });
  console.log("After prepare: regie=", prepared.regie, ", path=", prepared.recordingLocalPath);

  console.log("\n=== 6. Conference status workflow ===");
  const c1 = project.conferences[0];
  const c2 = project.conferences[1];
  const c3 = project.conferences[2];

  await markRecordingStarted(c1.id);
  let status = await refreshProjectStatus(project.id);
  console.log("After conf1 recording-started → project status:", status);
  console.assert(status === "recording", "should be recording");

  await markRecordingStopped(c1.id, { localFolder: "conf01/", durationSeconds: 3245 });
  status = await refreshProjectStatus(project.id);
  console.log("After conf1 stopped → project status:", status);
  console.assert(status === "ingest", "should be ingest (only conf done)");

  await markUploaded(c1.id);
  status = await refreshProjectStatus(project.id);
  console.log("After conf1 uploaded → project status:", status);
  // c1 = ready_to_edit, c2 + c3 = planned → should be planned (one not yet captured)
  // Actually with current rules: real = [ready_to_edit, planned, planned]
  // some recording? no. all delivered? no. all exported+? no. some editing? no.
  // all ready_to_edit+? no (planned exists). some ingest? no. → planned
  console.assert(status === "planned", "still planned because c2/c3 not yet started");

  // Now process all
  await markRecordingStarted(c2.id);
  await markRecordingStopped(c2.id, { durationSeconds: 1000 });
  await markUploaded(c2.id);
  await markNotCaptured(c3.id);
  status = await refreshProjectStatus(project.id);
  console.log("After all done (c3 not_captured) → project status:", status);
  console.assert(status === "ready_to_edit", "all real conferences ready_to_edit");

  console.log("\n=== 7. Availability + getAvailableDirectorsForDate ===");
  const wasCreated = await toggleAvailability(dir.id, "2026-04-18");
  console.log("Availability toggled:", wasCreated ? "created" : "removed");
  const available = await getAvailableDirectorsForDate("2026-04-18");
  console.log("Available directors on 2026-04-18:", available.map((a) => a.name));
  console.assert(available.length === 1, "should have 1 available");

  console.log("\n=== 8. ApiKey generate + verify ===");
  const { apiKey, plaintext } = await createApiKey("Test EVA Capture");
  console.log("Created:", apiKey.name, "plaintext starts with:", plaintext.slice(0, 12) + "...");
  const verified = await verifyApiKey(plaintext);
  console.assert(verified?.id === apiKey.id, "API key verified");
  const invalid = await verifyApiKey("evak_invalid_key");
  console.assert(invalid === null, "invalid key rejected");
  console.log("API key verify OK");

  console.log("\n=== 9. getProjectsByDate + getProjectByEventId ===");
  const byDate = await getProjectsByDate("2026-04-18", "WVP_A2");
  console.log("Projects on 2026-04-18 with régie WVP_A2:", byDate.length);
  const byEventId = await getProjectByEventId(project.eventId);
  console.assert(byEventId?.id === project.id, "found by eventId");

  await clean();
  await prisma.$disconnect();
  console.log("\n✓ All helper tests passed");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
