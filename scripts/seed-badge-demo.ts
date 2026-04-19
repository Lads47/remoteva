import prisma from "../src/lib/db";
import { createDirector, toggleAvailability } from "../src/lib/director";
import { createFlowProject } from "../src/lib/flow";
import { hashPassword } from "../src/lib/auth";

async function main() {
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();

  // Admin
  const passwordHash = await hashPassword("test1234");
  await prisma.adminUser.upsert({
    where: { email: "test@admin.local" },
    update: { passwordHash },
    create: { email: "test@admin.local", passwordHash },
  });

  // 3 réals
  const paul = await createDirector({ name: "Paul Martin", email: "paul@test.fr" });
  const tom = await createDirector({ name: "Tom Bernard", email: "tom@test.fr" });
  const sara = await createDirector({ name: "Sara Garcia", email: "sara@test.fr" });

  // 3 événements
  const ev1 = await createFlowProject({
    title: "Événement avec 2 dispos non validés",
    date: new Date("2026-04-25T00:00:00Z"),
    location: "Paris", room: "A",
    conferences: [{ title: "C1" }],
  });
  const ev2 = await createFlowProject({
    title: "Événement avec 1 dispo + réal validé",
    date: new Date("2026-04-29T00:00:00Z"),
    location: "Lyon", room: "B",
    conferences: [{ title: "C1" }],
  });
  const ev3 = await createFlowProject({
    title: "Événement sans dispo",
    date: new Date("2026-05-03T00:00:00Z"),
    location: "Bordeaux", room: "C",
    conferences: [{ title: "C1" }],
  });

  // Dispos
  await toggleAvailability(paul.id, "2026-04-25");
  await toggleAvailability(tom.id, "2026-04-25");
  await toggleAvailability(sara.id, "2026-04-29");

  // Valider Sara sur l'événement 2
  await prisma.flowProject.update({
    where: { id: ev2.id },
    data: { directorId: sara.id, director: sara.name },
  });

  console.log("Seeded:");
  console.log(`  ${ev1.eventId} - 2 réals dispos, AUCUN validé → badge orange clignotant`);
  console.log(`  ${ev2.eventId} - 1 réal dispo + 1 validé → badge vert`);
  console.log(`  ${ev3.eventId} - 0 dispo → pas de badge`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
