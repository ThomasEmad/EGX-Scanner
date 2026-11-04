import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const api = await fetch("http://localhost:3000/api/v1/rankings?metric=roe&basis=latest").then(r=>r.json())
  const top = api.results.slice(0,25).map(r=>r.ticker)
  const rows = await db.company.findMany({ where: { ticker: { in: top } }, select: { ticker: true, nameEn: true, nameAr: true, sector: true } })
  for (const r of rows) console.log(`${r.ticker.padEnd(5)} | ${r.sector.padEnd(20)} | ${r.nameEn}`)
} finally { await db.$disconnect() }
