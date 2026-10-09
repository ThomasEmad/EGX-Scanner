/* Derive discrete quarters from same-source cumulative pairs:
   Q2 = H1 − Q1 · Q3 = 9M − H1 · Q4 = FY − 9M
   GOLDEN RULE: both operands MUST come from the SAME sourceName (consistent
   definitions) and the SAME statementType. Derived values land in the existing
   Q2/Q3/Q4 report (only-missing-slot) or a new report, labeled DERIVED.
   Usage: node scripts/derive-quarters.cjs          (dry run)
          APPLY=1 node scripts/derive-quarters.cjs  */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const APPLY = process.env.APPLY === "1"

// cumulative periodType → (previous cumulative, derived discrete label/key)
const CHAIN = [
  { cum: "SEMIANNUAL", cumLabel: (y) => `H1 ${y}`, prev: { type: "QUARTERLY", label: (y) => `Q1 ${y}` }, derived: { type: "QUARTERLY", label: (y) => `Q2 ${y}`, key: (y) => `QUARTERLY:${y}:Q2` } },
  { cum: "NINE_MONTH", cumLabel: (y) => `9M ${y}`, prev: { type: "SEMIANNUAL", label: (y) => `H1 ${y}` }, derived: { type: "QUARTERLY", label: (y) => `Q3 ${y}`, key: (y) => `QUARTERLY:${y}:Q3` } },
  { cum: "ANNUAL", cumLabel: (y) => `FY ${y}`, prev: { type: "NINE_MONTH", label: (y) => `9M ${y}` }, derived: { type: "QUARTERLY", label: (y) => `Q4 ${y}`, key: (y) => `QUARTERLY:${y}:Q4` } },
]

// Balance-sheet (stock) items are point-in-time: the Q2 position EQUALS the H1
// position — they are COPIED, not subtracted. Flows (income/cash) subtract.
const STOCK_CODES = new Set(["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","EQUITY_PARENT","RETAINED_EARNINGS","SHARE_CAPITAL","CASH_AND_EQUIVALENTS","ACCOUNTS_RECEIVABLE","TRADE_PAYABLES","INVESTMENTS","PPE","DEPOSITS","INVENTORY","CURRENT_ASSETS","CURRENT_LIABILITIES","TOTAL_DEBT","NON_CONTROLLING_INTERESTS","CLOSING_CASH","GOODWILL","INTANGIBLE_ASSETS"])
const SKIP_CODES = new Set(["OPENING_CASH"]) // Q2 opening = Q1 closing — handled by the chain, skip

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, sector: true } })
  let derived = 0
  const samples = []
  for (const c of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: c.id, fiscalYear: { gte: 2023 } },
      select: { id: true, periodType: true, periodLabel: true, fiscalYear: true, sourceName: true, statementType: true },
    })
    for (const chain of CHAIN) {
      for (const fy of [2026, 2025, 2024, 2023]) {
        const cum = reports.find((r) => r.periodType === chain.cum && r.periodLabel === chain.cumLabel(fy))
        if (!cum) continue
        const prevRep = chain.prev ? reports.find((r) => r.periodType === chain.prev.type && r.periodLabel === chain.prev.label(fy)) : null
        if (chain.prev && !prevRep) continue
        if (cum.sourceName !== (prevRep?.sourceName ?? cum.sourceName)) continue // different sources → inconsistent definitions
        const cumVals = await db.financialValue.findMany({ where: { reportId: cum.id }, select: { metricCode: true, normalizedValue: true } })
        const prevVals = prevRep ? await db.financialValue.findMany({ where: { reportId: prevRep.id }, select: { metricCode: true, normalizedValue: true } }) : []
        const prevMap = new Map(prevVals.map((v) => [v.metricCode, v.normalizedValue]))
        // target discrete report
        let target = reports.find((r) => r.periodType === chain.derived.type && r.periodLabel === chain.derived.label(fy))
        const targetVals = target ? await db.financialValue.findMany({ where: { reportId: target.id }, select: { metricCode: true } }) : []
        const have = new Set(targetVals.map((v) => v.metricCode))
        for (const v of cumVals) {
          if (v.normalizedValue === null) continue
          if (have.has(v.metricCode)) continue // discrete slot already filled (e.g. TV revenue) — never overwrite
          if (SKIP_CODES.has(v.metricCode)) continue
          const isStock = STOCK_CODES.has(v.metricCode)
          let value
          if (isStock) {
            value = v.normalizedValue // Q2 position = H1 position (point-in-time)
          } else {
            // FLOW gates — bank statements mix definitions chaotically (COMI Q2 lesson)
            if (c.sector === "Banks") continue
            const prevV = chain.prev ? prevMap.get(v.metricCode) : 0
            if (chain.prev && (prevV === undefined || prevV === null)) continue
            value = v.normalizedValue - (chain.prev ? prevV : 0) // flow: subtract
            // sanity: quarterly flows don't swing >4x or <0.25x vs the prior quarter
            // (COMI: derived Q2 NP was 0.21x Q1 because Yahoo's H1 report contradicted Q1)
            if (prevV !== 0 && (Math.abs(value) < Math.abs(prevV) * 0.25 || Math.abs(value) > Math.abs(prevV) * 4)) continue
          }
          if (Math.abs(value) < 1) continue
          if (APPLY) {
            if (!target) {
              target = await db.financialReport.create({
                data: {
                  companyId: c.id,
                  reportType: "INTERIM",
                  periodType: chain.derived.type,
                  periodLabel: chain.derived.label(fy),
                  fiscalYear: fy,
                  periodEnd: new Date(`${fy}-06-30`),
                  statementType: cum.statementType,
                  processingStatus: "APPROVED",
                  sourceName: `${cum.sourceName} (DERIVED)`,
                  version: 1,
                },
              })
              reports.push({ ...target, periodType: chain.derived.type, periodLabel: chain.derived.label(fy) })
            }
            await db.financialValue.create({
              data: {
                companyId: c.id,
                reportId: target.id,
                metricCode: v.metricCode,
                originalLabel: isStock ? `COPIED from ${chain.cumLabel(fy)} balance sheet (source: ${cum.sourceName})` : `DERIVED ${chain.derived.label(fy)} = ${chain.cumLabel(fy)}${chain.prev ? " − " + chain.prev.label(fy) : ""} (source: ${cum.sourceName})`,
                value,
                currency: "EGP",
                unit: "UNIT",
                statementType: cum.statementType,
                extractionMethod: "MANUAL_ENTRY",
                normalizedValue: value,
                validationStatus: "VALID",
              },
            })
          }
          derived++
          if (samples.length < 8) samples.push(`${c.ticker} ${chain.derived.label(fy)} ${v.metricCode}=${Math.round(value / 1e6)}M (${cum.sourceName.slice(0, 15)})`)
        }
      }
    }
  }
  console.log(JSON.stringify({ applied: APPLY, derivedValues: derived, samples }, null, 1))
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
