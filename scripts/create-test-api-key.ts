import { createApiKey } from "../src/lib/apiKey";
import prisma from "../src/lib/db";

async function main() {
  // Cleanup any existing test keys
  await prisma.apiKey.deleteMany({ where: { name: "TEST-CURL-KEY" } });

  const { plaintext, apiKey } = await createApiKey("TEST-CURL-KEY");
  console.log("API_KEY=" + plaintext);
  console.log("PREFIX=" + apiKey.prefix);
  console.log("ID=" + apiKey.id);
  await prisma.$disconnect();
}

main().catch((err) => { console.error(err); process.exit(1); });
