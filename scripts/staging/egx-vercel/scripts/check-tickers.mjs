import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.company.findMany({
    where: { ticker: { in: ["DOMTY","DOMT","PHDC","ORWE","ICFC","MASR","UPMS","AMPH","ECCW","NCEM","NOAF","GROV","NAMI","ELEC"] } },
    select: { ticker: true, nameEn: true, sector: true, isActive: true, listingStatus: true },
  })
  for (const r of rows) console.log(r.ticker, "|", r.nameEn, "|", r.sector, "|", r.listingStatus, r.isActive)
} finally { await db.$disconnect() }
