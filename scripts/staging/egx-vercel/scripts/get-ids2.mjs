import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try { for (const t of ["COMI","FWRY","UNIT","MBSC"]) { const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, sector: true } }); console.log(t, c.id, c.sector) } } finally { await db.$disconnect() }
