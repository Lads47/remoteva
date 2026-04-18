import { hashPassword } from "../src/lib/auth";

const password = process.argv[2];
if (!password) {
  console.error("Usage: npx tsx scripts/reset-admin-password.ts <password>");
  process.exit(1);
}

(async () => {
  const hash = await hashPassword(password);
  console.log(hash);
})();
