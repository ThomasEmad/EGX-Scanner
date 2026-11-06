import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const rows = await db.company.findMany({ where: { ticker: { in: ["EGSA","HBCO","KORA","RKAZ","BIDI","DCRC","COPR","LUTS","NDRL","PMSC","UPMS","UEGC","ICFC"] } }, select: { ticker: true, nameEn: true, sector: true, isin: true } })
  for (const r of rows) console.log(r.ticker, "|", r.nameEn, "|", r.sector, "|", r.isin)
} finally { await db.$disconnect() }
