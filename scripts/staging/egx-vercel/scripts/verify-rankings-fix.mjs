// Verify the new rankings selection logic (mirror of route.ts) on real data:
// flow metrics must resolve to TTM > annual, never raw interim; stock metrics
// keep the freshest announced period.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const PERIOD_INSENSITIVE = new Set([
  'market_cap', 'p_b', 'book_value_per_share', 'current_ratio',
  'debt_to_equity', 'liabilities_to_equity', 'total_assets', 'total_equity', 'total_debt',
])

function quarterIndex(periodType, periodLabel) {
  const q = periodLabel.match(/Q([1-4])/)
  if (q) return Number(q[1])
  if (/9M/i.test(periodLabel)) return 3
  if (/H1/i.test(periodLabel)) return 2
  if (periodType === 'ANNUAL') return 4
  return 0
}

for (const metric of ['p_e', 'roe', 'net_margin', 'market_cap']) {
  const rows = await db.$queryRawUnsafe(`
    SELECT c.id AS companyId, c.ticker AS t, cm.value, cm."fiscalYear" AS fy, cm."periodLabel" AS pl, cm."periodType" AS pt, cm."statementType" AS st
    FROM CalculatedMetric cm JOIN Company c ON c.id = cm.companyId AND c."isActive" = 1
    WHERE cm.code = ? AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL AND cm."fiscalYear" >= 2023
  `, metric)
  const withKeys = rows.map(r => ({ ...r, sortKey: Number(r.fy) * 10 + quarterIndex(r.pt, r.pl) }))
  const maxKey = withKeys.reduce((m, r) => Math.max(m, r.sortKey), 0)
  const minKey = maxKey - 4
  const annualMinKey = (Math.floor(maxKey / 10) - 1) * 10 + 4
  const flowMetric = !PERIOD_INSENSITIVE.has(metric)
  const byCompany = new Map()
  for (const r of withKeys) {
    if (flowMetric && r.pt === 'QUARTERLY') continue
    if (r.pt === 'ANNUAL') { if (r.sortKey < annualMinKey) continue }
    else if (r.sortKey < minKey) continue
    const prev = byCompany.get(r.companyId)
    if (!prev || r.sortKey > prev.sortKey || (r.sortKey === prev.sortKey && r.st === 'CONSOLIDATED' && prev.st !== 'CONSOLIDATED')) {
      byCompany.set(r.companyId, r)
    }
  }
  const results = [...byCompany.values()].sort((a, b) => Number(b.value) - Number(a.value))
  const ptMix = {}
  for (const r of results) ptMix[r.pt] = (ptMix[r.pt] ?? 0) + 1
  console.log(`\n### ${metric} — n=${results.length} periodType mix=${JSON.stringify(ptMix)}`)
  for (const r of results.slice(0, 5)) console.log(`   TOP ${r.t} [${r.pt} ${r.pl}] = ${Number(r.value).toFixed(3)}`)
  const comi = results.find(r => r.t === 'COMI'), etel = results.find(r => r.t === 'ETEL'), tmgh = results.find(r => r.t === 'TMGH')
  for (const x of [comi, etel, tmgh]) if (x) console.log(`   CHECK ${x.t} [${x.pt} ${x.pl}] = ${Number(x.value).toFixed(3)}`)
}
await db.$disconnect()
