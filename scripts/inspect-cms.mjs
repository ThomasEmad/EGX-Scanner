import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const ticker = process.argv[2] ?? "FWRY"
try {
  const c = await db.company.findFirst({ where: { ticker }, select: { id: true, ticker: true, sector: true } })
  if (!c) { console.log("not found"); process.exit(0) }
  const rows = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ["roe", "net_profit", "revenue", "net_margin", "total_equity"] } },
    orderBy: [{ fiscalYear: "desc" }, { periodKey: "desc" }],
    take: 40,
    select: { code: true, value: true, periodKey: true, periodLabel: true, periodType: true, statementType: true, valueStatus: true, fiscalYear: true },
  })
  console.log(c.ticker, c.sector)
  for (const r of rows) console.log(`${r.code.padEnd(14)} ${String(r.value).padEnd(16)} ${r.periodLabel.padEnd(22)} ${r.periodType.padEnd(10)} ${r.statementType.padEnd(12)} ${r.valueStatus}`)
} finally { await db.$disconnect() }
