// Audit ranking-filter data: per metric, distribution + extremes with
// ticker+period, split by periodType (quarterly vs annual basis mixing).
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const METRICS = ['roe', 'roa', 'net_margin', 'p_e', 'p_b', 'market_cap', 'dividend_yield', 'debt_to_equity', 'current_ratio', 'eps', 'book_value_per_share', 'revenue_growth_yoy', 'net_profit_growth_yoy']
const LIMITS = {
  roe: v => Math.abs(v) > 60, roa: v => Math.abs(v) > 30, net_margin: v => Math.abs(v) > 60,
  p_e: v => v < 1 || v > 150, p_b: v => v < 0.15 || v > 40, market_cap: () => false,
  dividend_yield: v => v > 20 || v < 0, debt_to_equity: v => v > 5 || v < 0,
  current_ratio: v => v < 0.3 || v > 15, eps: v => false, book_value_per_share: v => false,
  revenue_growth_yoy: v => v > 200 || v < -70, net_profit_growth_yoy: v => Math.abs(v) > 300,
}

for (const code of METRICS) {
  const rows = await db.$queryRawUnsafe(`
    SELECT c.ticker AS t, c.sector AS s, cm.value AS v, cm."fiscalYear" AS fy, cm."periodLabel" AS pl, cm."periodType" AS pt
    FROM CalculatedMetric cm JOIN Company c ON c.id = cm.companyId AND c."isActive" = 1
    WHERE cm.code = ? AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL AND cm."fiscalYear" >= 2023
  `, code)
  if (!rows.length) { console.log(`\n### ${code}: NO DATA`); continue }
  const vals = rows.map(r => Number(r.v)).sort((a, b) => a - b)
  const median = vals[Math.floor(vals.length / 2)]
  const p5 = vals[Math.floor(vals.length * 0.05)], p95 = vals[Math.floor(vals.length * 0.95)]
  const lim = LIMITS[code] ?? (() => false)
  const extreme = rows.filter(r => lim(Number(r.v)))
  const nQ = rows.filter(r => r.pt === 'QUARTERLY').length, nA = rows.filter(r => r.pt === 'ANNUAL').length
  console.log(`\n### ${code} | n=${rows.length} (Q:${nQ}/A:${nA}) | median=${median.toFixed(3)} p5=${p5.toFixed(3)} p95=${p95.toFixed(3)} | extremes=${extreme.length}`)
  for (const r of extreme.slice(0, 6)) console.log(`   ${r.t} [${r.pt} ${r.pl}] = ${Number(r.v).toFixed(3)}`)
}
await db.$disconnect()
