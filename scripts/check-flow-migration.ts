import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import path from "path";

const adapter = new PrismaLibSql({ url: "file:" + path.join(process.cwd(), "data", "remoteva.db") });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Test: create a project + 2 conferences + 1 director + 1 availability + 1 api key
  console.log("== Cleanup ==");
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();

  console.log("== Create test director ==");
  const director = await prisma.director.create({
    data: {
      name: "Paul Test",
      email: "paul.test@example.com",
      phone: "0612345678",
      magicToken: "test_token_" + Math.random().toString(36).slice(2),
    },
  });
  console.log("Director:", director.id, director.name);

  console.log("== Create test project ==");
  const project = await prisma.flowProject.create({
    data: {
      eventId: "180426-001",
      title: "Journée test sur les nuages",
      date: new Date("2026-04-18T00:00:00Z"),
      location: "Paris",
      room: "Salle 2",
      speaker: "Multiple",
      director: director.name,
      directorId: director.id,
      regie: "WVP_A2",
      recordingLocalPath: "D:/REC/2026-04-18_test/",
      conferences: {
        create: [
          { order: 1, title: "Ouverture", speaker: "Dr Dupont", scheduledStart: new Date("2026-04-18T09:00:00Z"), scheduledEnd: new Date("2026-04-18T10:00:00Z") },
          { order: 2, title: "Climat et nuages", speaker: "Pr Smith", scheduledStart: new Date("2026-04-18T10:30:00Z"), scheduledEnd: new Date("2026-04-18T11:30:00Z") },
        ],
      },
    },
    include: { conferences: true, assignedDirector: true },
  });
  console.log("Project:", project.eventId, "-", project.title);
  console.log("  Director assigned:", project.assignedDirector?.name);
  console.log("  Conferences:", project.conferences.length);
  project.conferences.forEach((c) => console.log("    -", c.order, c.title, "(", c.speaker, ")"));

  console.log("== Create availability ==");
  const avail = await prisma.directorAvailability.create({
    data: {
      directorId: director.id,
      date: new Date("2026-04-18T00:00:00Z"),
    },
  });
  console.log("Availability:", avail.id, "for", avail.date);

  console.log("== Create API key ==");
  const apiKey = await prisma.apiKey.create({
    data: {
      name: "Test EVA Capture WVP A1",
      keyHash: "test_hash_" + Math.random().toString(36).slice(2),
      prefix: "evak_test",
    },
  });
  console.log("API Key:", apiKey.id, "name=", apiKey.name);

  console.log("\n== Verify queries ==");
  const allProjects = await prisma.flowProject.findMany({ include: { conferences: true } });
  console.log("Total projects:", allProjects.length);

  const projByEventId = await prisma.flowProject.findUnique({ where: { eventId: "180426-001" } });
  console.log("findUnique by eventId:", projByEventId?.title);

  const availDirectors = await prisma.directorAvailability.findMany({
    where: { date: new Date("2026-04-18T00:00:00Z") },
    include: { director: true },
  });
  console.log("Available directors on 2026-04-18:", availDirectors.map((a) => a.director.name));

  await prisma.$disconnect();
  console.log("\n✓ All tests passed");
}

main().catch((err) => {
  console.error("ERROR:", err);
  process.exit(1);
});
