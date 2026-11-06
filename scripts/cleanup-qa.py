# remove QA test user created during end-to-end check (keeps cached analysis row harmlessly)
import subprocess
r = subprocess.run(["bun", "-e", '''
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const u = await db.user.findMany({ where: { email: { startsWith: "qa-prod-check-" } } });
for (const x of u) {
  await db.smartAnalysisUsage.deleteMany({ where: { userId: x.id } });
  await db.session.deleteMany({ where: { userId: x.id } });
  await db.user.delete({ where: { id: x.id } });
}
console.log("removed", u.length, "qa users");
await db.$disconnect();
'''], cwd="/tmp/my-project", capture_output=True, text=True, timeout=60)
print(r.stdout[-200:] if r.stdout else r.stderr[-300:])
