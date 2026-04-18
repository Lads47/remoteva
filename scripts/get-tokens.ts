import prisma from "../src/lib/db";
(async () => {
  const dirs = await prisma.director.findMany();
  for (const d of dirs) console.log(`${d.name} → token=${d.magicToken}`);
  await prisma.$disconnect();
})();
