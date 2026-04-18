import prisma from "../src/lib/db";
import { verifyPassword, createSession } from "../src/lib/auth";

(async () => {
  try {
    const user = await prisma.adminUser.findUnique({ where: { email: "test@admin.local" } });
    console.log("User found:", !!user, user?.id);
    if (user) {
      const ok = await verifyPassword("test1234", user.passwordHash);
      console.log("Password OK:", ok);
      try {
        await createSession({ userId: user.id, email: user.email });
        console.log("Session created");
      } catch (e) {
        console.error("createSession err:", e);
      }
    }
    await prisma.$disconnect();
  } catch (err) {
    console.error("ERR:", err);
  }
})();
