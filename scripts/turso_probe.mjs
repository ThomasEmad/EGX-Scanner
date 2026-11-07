// Direct Turso probe: replicate the exact queries of the failing production
// routes (/companies/[id], /metrics, /financials) and time each one.
// READ-ONLY — no writes anywhere.
import fs from 'node:fs'

const TURSO_URL = fs.readFileSync('/home/z/my-project/scripts/.turso_url', 'utf8').trim()
const TURSO_TOKEN = fs.readFileSync('/home/z/my-project/scripts/.turso_token', 'utf8').trim()

process.env.TURSO_DATABASE_URL = TURSO_URL
process.env.TURSO_AUTH_TOKEN = TURSO_TOKEN

const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')

const adapter = new PrismaLibSQL({ url: TURSO_URL, authToken: TURSO_TOKEN })
const db = new PrismaClient({ adapter, log: ['error'] })

const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]
const TICKER = process.argv[2] || 'AALR'

async function step(name, fn) {
  const t0 = Date.now()
  try {
    const r = await fn()
    const ms = Date.now() - t0
    const size = typeof r === 'string' ? r.length : JSON.stringify(r ?? null)?.length ?? 0
    console.log(`✓ ${name} — ${ms}ms, ~${size}B`)
    return r
  } catch (e) {
    const ms = Date.now() - t0
    console.log(`✗ ${name} — FAILED after ${ms}ms`)
    console.log('   ' + String(e?.message ?? e).slice(0, 600).split('\n').join('\n   '))
    return null
  }
}

console.log('Turso host:', TURSO_URL.replace('libsql://', '').split('.')[0])

const company = await step('1. company.findFirst (findCompanyByKey)', () =>
  db.company.findFirst({
    where: { OR: [{ id: TICKER }, { ticker: TICKER.toUpperCase() }, { isin: TICKER.toUpperCase() }] },
    select: { id: true },
  })
)
if (!company) { console.log('company not found'); process.exit(0) }
const companyId = company.id
console.log('  companyId:', companyId)

// financials route
await step('2. availableReportStatementTypes (distinct)', () =>
  db.financialReport.findMany({
    where: { companyId, processingStatus: { in: [...TRUSTED] } },
    select: { statementType: true },
    distinct: ["statementType"],
  })
)
await step('3. availableReportPeriodViews (distinct)', () =>
  db.financialReport.findMany({
    where: { companyId, processingStatus: { in: [...TRUSTED] } },
    select: { periodType: true },
    distinct: ["periodType"],
  })
)
await step('4. financialReport.groupBy (latestEnds)', () =>
  db.financialReport.groupBy({
    by: ["periodType"],
    where: { companyId, processingStatus: { in: [...TRUSTED] }, periodType: { in: ["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] } },
    _max: { periodEnd: true },
  })
)
await step('5. financialValue.findMany (statements body)', () =>
  db.financialValue.findMany({
    where: { companyId, validationStatus: "VALID", report: { processingStatus: { in: [...TRUSTED] }, statementType: "CONSOLIDATED", periodType: { in: ["ANNUAL"] } } },
    include: { report: { select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, processingStatus: true } } },
    orderBy: [{ reportId: "asc" }],
  }).then(r => `${r.length} rows`)
)

// metrics route (paged fetchCalc core query)
const PAGE = 1200
let calcPages = 0, calcRows = 0, cursor, calcMs = 0, calcErr = null
const t0 = Date.now()
for (;;) {
  try {
    const page = await db.calculatedMetric.findMany({
      where: { companyId, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
      orderBy: [{ code: "asc" }, { periodKey: "asc" }, { id: "asc" }],
      select: { id: true, companyId: true, code: true, periodKey: true, periodType: true, fiscalYear: true, periodLabel: true, value: true, valueStatus: true, statusDetail: true, formulaVersion: true, statementType: true, calculatedAt: true },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    })
    calcPages++
    calcRows += page.length
    if (page.length < PAGE) break
    cursor = page[page.length - 1].id
  } catch (e) {
    calcErr = String(e?.message ?? e).slice(0, 500)
    break
  }
}
calcMs = Date.now() - t0
console.log(calcErr ? `✗ 6. paged calculatedMetric.findMany — FAILED after ${calcMs}ms (${calcPages} pages ok)\n   ${calcErr}` : `✓ 6. paged calculatedMetric.findMany — ${calcMs}ms, ${calcRows} rows in ${calcPages} pages`)

// main company route pieces
await step('7. latestCalcPeriodKeys core (calculatedMetric findMany group-ish)', () =>
  db.calculatedMetric.findMany({
    where: { companyId, periodType: { in: ["ANNUAL", "QUARTERLY", "TTM"] } },
    select: { periodKey: true, periodType: true, statementType: true, fiscalYear: true },
    take: 50,
  }).then(r => `${r.length} rows`)
)
await step('8. scannerRule.findMany (presets)', () =>
  db.scannerRule.findMany({ where: { isPreset: true, isActive: true } }).then(r => `${r.length} presets`)
)
await step('9. financialReport.findFirst (data-as-of)', () =>
  db.financialReport.findFirst({
    where: { companyId, processingStatus: { in: [...TRUSTED] }, deletedAt: null, periodEnd: { lte: new Date() } },
    orderBy: { periodEnd: "desc" },
    select: { periodEnd: true, periodLabel: true },
  })
)
await step('10. company include _count', () =>
  db.company.findFirst({
    where: { id: companyId },
    include: { _count: { select: { reports: true, events: true, dividends: true, values: true } } },
    select: { ticker: true },
  }).then(r => JSON.stringify(r?._count))
)

await db.$disconnect()
console.log('DONE')
