import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const cs = await db.company.findMany({
  where: { OR: [{ nameAr: { contains: 'المتحد' } }, { nameEn: { contains: 'United' } }] },
  select: { ticker: true, nameEn: true, nameAr: true, isActive: true },
})
for (const c of cs) console.log(c.ticker, '|', c.nameEn, '|', c.nameAr, '| active:', c.isActive)
await db.$disconnect()
