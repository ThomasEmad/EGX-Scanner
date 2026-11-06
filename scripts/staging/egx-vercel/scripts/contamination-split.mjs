// Split contamination groups by value precision:
//  - "fabricated": non-trivial decimals (not a multiple of 1000) shared by >=3 companies → quarantine
//  - "round-collision": multiples of 1000 shared — likely legit rounding, keep but report
import { PrismaClient } from '@prisma/client'
import { writeFileSync } from 'node:fs'
const db = new PrismaClient()

const groups = await db.$queryRawUnsafe(`
  SELECT fv.metricCode AS metricCode, fr.fiscalYear AS fiscalYear, fv.normalizedValue AS val,
         COUNT(DISTINCT fv.companyId) AS nCompanies,
         GROUP_CONCAT(fv.id) AS valueIds
  FROM FinancialValue fv
  JOIN FinancialReport fr ON fr.id = fv.reportId AND fr.deletedAt IS NULL AND fr.periodType = 'ANNUAL'
  JOIN Company c ON c.id = fv.companyId
  WHERE fv.normalizedValue IS NOT NULL
    AND ABS(fv.normalizedValue) > 100000
    AND fv.validationStatus != 'FAILED'
    AND (fv.validationNotes IS NULL OR fv.validationNotes NOT LIKE 'AUDIT_QUARANTINE%')
  GROUP BY fv.metricCode, fr.fiscalYear, fv.normalizedValue
  HAVING COUNT(DISTINCT fv.companyId) >= 3
`)

const fabricated = [], roundCollision = []
for (const g of groups) {
  const v = Number(g.val)
  const isRound = Math.abs(v % 1000) < 0.01 // integer multiples of 1k (rounded reporting)
  ;(isRound ? roundCollision : fabricated).push(g)
}
const fabRows = new Set(), fabCompanies = new Set()
const fabSources = new Map()
for (const g of fabricated) {
  const ids = String(g.valueIds).split(',')
  for (const id of ids) fabRows.add(id)
}
// fetch per-row source attribution for the fabricated set
const idList = [...fabRows]
const sourceRows = []
for (let i = 0; i < idList.length; i += 400) {
  const chunk = idList.slice(i, i + 400)
  const rs = await db.financialValue.findMany({
    where: { id: { in: chunk } },
    select: { id: true, metricCode: true, normalizedValue: true, report: { select: { sourceName: true, fiscalYear: true } } },
  })
  sourceRows.push(...rs)
}
for (const r of sourceRows) {
  const s = r.report.sourceName
  fabSources.set(s, (fabSources.get(s) ?? 0) + 1)
}
// companies affected (distinct tickers)
const companiesRows = await db.financialValue.findMany({
  where: { id: { in: idList } },
  select: { company: { select: { ticker: true } } },
})
for (const r of companiesRows) fabCompanies.add(r.company.ticker)

const out = {
  totalGroups: groups.length,
  fabricatedGroups: fabricated.length,
  fabricatedRows: fabRows.size,
  fabricatedCompanies: [...fabCompanies].sort(),
  fabricatedBySource: Object.fromEntries([...fabSources.entries()].sort((a, b) => b[1] - a[1])),
  roundCollisionGroups: roundCollision.length,
  worstFabricated: fabricated.sort((a, b) => Number(b.nCompanies) - Number(a.nCompanies)).slice(0, 12).map(g => ({ m: g.metricCode, fy: g.fiscalYear, v: String(g.val), n: Number(g.nCompanies) })),
}
writeFileSync('contamination-fabricated.json', JSON.stringify({ ...out, quarantineIds: idList }, null, 2))
console.log(JSON.stringify({ ...out, quarantineIds: undefined, fabricatedCompanies: out.fabricatedCompanies.length }, null, 2))
await db.$disconnect()
