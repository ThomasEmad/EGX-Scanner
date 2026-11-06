import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  for (const t of ["EAST","EGAL","CANA","SIPC","TALM"]) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true } })
    console.log(`${t} ${c.id}`)
  }
} finally { await db.$disconnect() }
