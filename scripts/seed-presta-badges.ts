import prisma from "../src/lib/db";
import { createDirector, toggleAvailability } from "../src/lib/director";
import { createFlowProject } from "../src/lib/flow";

async function main() {
  await prisma.directorAvailability.deleteMany();
  await prisma.conference.deleteMany();
  await prisma.flowProject.deleteMany();
  await prisma.director.deleteMany();
  await prisma.apiKey.deleteMany();

  const paul = await createDirector({ name: "Paul", email: "paul@x.com" });
  const tom = await createDirector({ name: "Tom", email: "tom@x.com" });

  // 4 events :
  // ev1 : Paul positionné, pas validé → badge "Tu t'es positionné"
  // ev2 : Paul positionné + validé → badge "Tu es validé"
  // ev3 : Tom validé (pas Paul) → pas de badge pour Paul
  // ev4 : personne → pas de badge
  const ev1 = await createFlowProject({ title: "Ev1 Paul positionné", date: new Date("2026-04-25T00:00:00Z"), location: "Paris", room: "A", conferences: [{ title: "C" }] });
  const ev2 = await createFlowProject({ title: "Ev2 Paul validé", date: new Date("2026-04-26T00:00:00Z"), location: "Lyon", room: "B", conferences: [{ title: "C" }] });
  const ev3 = await createFlowProject({ title: "Ev3 Tom validé", date: new Date("2026-04-27T00:00:00Z"), location: "Lyon", room: "B", conferences: [{ title: "C" }] });
  const ev4 = await createFlowProject({ title: "Ev4 sans réal", date: new Date("2026-04-28T00:00:00Z"), location: "Bordeaux", room: "C", conferences: [{ title: "C" }] });

  await toggleAvailability(paul.id, "2026-04-25");
  await toggleAvailability(paul.id, "2026-04-26");
  await toggleAvailability(tom.id, "2026-04-27");

  await prisma.flowProject.update({ where: { id: ev2.id }, data: { directorId: paul.id, director: paul.name } });
  await prisma.flowProject.update({ where: { id: ev3.id }, data: { directorId: tom.id, director: tom.name } });

  console.log("Token Paul:", paul.magicToken);
  console.log("(Pour Paul: ev1=positionné, ev2=validé, ev3=rien (validé Tom), ev4=rien)");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
