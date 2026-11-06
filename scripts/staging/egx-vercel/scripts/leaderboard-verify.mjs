// Final leaderboard verification: mimic the rankings route (latest basis ladder +
// growth >500% guard) for key metrics and check the fixed companies.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function quarterIndex(periodType, periodLabel) {
  const q = periodLabel.match(/Q([1-4])/)
  if (q) return Number(q[1])
  if (/9M/i.test(periodLabel)) return 3
  if (/H1/i.test(periodLabel)) return 2
  if (periodType === 'ANNUAL') return 4
  return 0
}
const PERIOD_INSENSITIVE = new Set(['market_cap', 'p_b', 'book_value_per_share', 'current_ratio', 'debt_to_equity', 'liabilities_to_equity', 'total_assets', 'total_equity', 'total_debt'])

async function leaderboard(metric) {
  const rows = await db.$queryRawUnsafe(`
    SELECT cm.value, cm."fiscalYear", cm."periodLabel", cm."periodType", cm."statementType",
           c.ticker, c."nameEn", c.sector
    FROM CalculatedMetric cm JOIN Company c ON c.id = cm.companyId AND c."isActive" = 1
    WHERE cm.code = ? AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL AND cm."fiscalYear" >= 2023`, metric)
  const withKeys = rows.map((r) => ({ ...r, sortKey: r.fiscalYear * 10 + quarterIndex(r.periodType, r.periodLabel) }))
  const maxKey = Math.max(...withKeys.map((r) => r.sortKey))
  const minKey = maxKey - 4
  const annualMinKey = (Math.floor(maxKey / 10) - 1) * 10 + 4
  const flowMetric = !PERIOD_INSENSITIVE.has(metric)
  const byCompany = new Map()
  for (const r of withKeys) {
    if (flowMetric && r.periodType === 'QUARTERLY') continue
    if (r.periodType === 'ANNUAL') { if (r.sortKey < annualMinKey) continue } else if (r.sortKey < minKey) continue
    const prev = byCompany.get(r.ticker)
    if (!prev || r.sortKey > prev.sortKey || (r.sortKey === prev.sortKey && r.statementType === 'CONSOLIDATED' && prev.statementType !== 'CONSOLIDATED')) byCompany.set(r.ticker, r)
  }
  return [...byCompany.values()]
}

const fmt = (v) => Math.abs(v) >= 1e9 ? (v / 1e9).toFixed(2) + 'B' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v.toFixed(2)

for (const metric of ['profit_growth', 'revenue_growth', 'equity_growth', 'roe', 'net_profit', 'revenue', 'p_e']) {
  const all = await leaderboard(metric)
  const isGrowth = metric.endsWith('_growth')
  const excluded = isGrowth ? all.filter((r) => Math.abs(Number(r.value)) > 500) : []
  const ranked = isGrowth ? all.filter((r) => Math.abs(Number(r.value)) <= 500) : all
  ranked.sort((a, b) => Number(b.value) - Number(a.value))
  console.log(`\n=== ${metric} — top 8 (of ${ranked.length}${excluded.length ? `, ${excluded.length} extreme excluded: ` + excluded.slice(0, 4).map((e) => `${e.ticker} ${Number(e.value).toFixed(0)}%`).join(', ') : ''})`)
  for (const r of ranked.slice(0, 8)) console.log(`  ${r.ticker.padEnd(6)} ${Number(r.value).toLocaleString().slice(0, 12).padEnd(12)} ${r.periodLabel} ${r.sector.slice(0, 18)}`)
}

// spot-check the remediated companies' current headline figures (TTM/annual basis)
console.log('\n=== remediated companies (latest flow CMs)')
for (const t of ['UBEE', 'HDBK', 'GSSC', 'MAAL', 'EXPA', 'CCAP']) {
  const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
  const cms = await db.calculatedMetric.findMany({
    where: { companyId: c.id, code: { in: ['net_profit', 'roe', 'p_e', 'eps'] }, valueStatus: 'OK' },
    orderBy: [{ fiscalYear: 'desc' }, { periodType: 'desc' }], take: 40,
  })
  const best = {}
  for (const m of cms) if (!best[m.code]) best[m.code] = m
  console.log(`  ${t.padEnd(5)} ` + Object.entries(best).map(([code, m]) => `${code}=${fmt(Number(m.value))} (${m.periodLabel})`).join('  '))
}
await db.$disconnect()
