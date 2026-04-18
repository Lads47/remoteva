/**
 * Seed démo : 2 réalisateurs (1 dispo aujourd'hui), 1 projet avec 3 confs, 1 API key.
 * Pour tester l'UI admin localement.
 */
import prisma from "../src/lib/db";
import { createDirector, toggleAvailability } from "../src/lib/director";
import { createApiKey } from "../src/lib/apiKey";
import { createFlowProject } from "../src/lib/flow";

async function main() {
  // Cleanup
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();

  console.log("== Création réalisateurs ==");
  const paul = await createDirector({ name: "Paul Martin", email: "paul@example.com", phone: "0612345678" });
  const tom = await createDirector({ name: "Tom Bernard", email: "tom@example.com", phone: "0698765432" });
  console.log("  -", paul.name, "(", paul.email, ")");
  console.log("  -", tom.name, "(", tom.email, ")");

  // Paul est dispo le 25 avril
  await toggleAvailability(paul.id, "2026-04-25");

  console.log("\n== Création projet ==");
  const project = await createFlowProject({
    title: "Journée sur les nuages",
    date: new Date("2026-04-25T00:00:00Z"),
    location: "Paris",
    room: "Amphi A",
    speaker: "Multiples intervenants",
    notes: "Prévoir un micro HF supplémentaire pour la table ronde finale.",
    conferences: [
      { title: "Ouverture & présentation", speaker: "Dr Marie Dupont", scheduledStart: new Date("2026-04-25T09:00:00Z"), scheduledEnd: new Date("2026-04-25T09:30:00Z") },
      { title: "Climat et formation des nuages", speaker: "Pr Jean Smith", scheduledStart: new Date("2026-04-25T09:45:00Z"), scheduledEnd: new Date("2026-04-25T10:45:00Z") },
      { title: "Table ronde finale", speaker: "Dr Dupont, Pr Smith, Mme Garcia", scheduledStart: new Date("2026-04-25T11:00:00Z"), scheduledEnd: new Date("2026-04-25T12:00:00Z") },
    ],
  });
  console.log("  -", project.eventId, "-", project.title, "avec", project.conferences.length, "conférences");

  console.log("\n== Création API key ==");
  const { plaintext, apiKey } = await createApiKey("EVA Capture WVP A1 - Demo");
  console.log("  -", apiKey.name, "(", plaintext, ")");

  await prisma.$disconnect();
  console.log("\n✓ Seed démo terminé");
}

main().catch((err) => { console.error(err); process.exit(1); });
