import prisma from "../src/lib/db";
import { createDirector } from "../src/lib/director";
import { createFlowProject } from "../src/lib/flow";

async function main() {
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();

  const dir = await createDirector({
    name: "Test Réal",
    email: "test.real@example.com",
    phone: "0612345678",
  });

  // 2 événements futurs (en avril 2026 pour matcher la vue par défaut)
  await createFlowProject({
    title: "Événement test 1",
    date: new Date("2026-04-25T00:00:00Z"),
    location: "Paris",
    room: "A",
    conferences: [{ title: "C1" }],
  });
  await createFlowProject({
    title: "Événement test 2",
    date: new Date("2026-04-29T00:00:00Z"),
    location: "Lyon",
    room: "B",
    conferences: [{ title: "C1" }],
  });
  // 1 événement passé (avril 2026 mais date < aujourd'hui)
  await createFlowProject({
    title: "Événement passé",
    date: new Date("2026-04-10T00:00:00Z"),
    location: "Bordeaux",
    room: "C",
    conferences: [{ title: "C1" }],
  });

  console.log("Token presta:", dir.magicToken);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
