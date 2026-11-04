import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["FWRY","UNIT","MBSC"]) {
    const c = await db.company.findFirst({ where: { ticker: t }, select: { id: true } })
    console.log(t, c.id)
  }
} finally { await db.$disconnect() }
