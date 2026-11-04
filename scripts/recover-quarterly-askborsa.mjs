// Replace annual-copy quarterly values with verified AskBorsa discrete quarters.
//
//   node scripts/recover-quarterly-askborsa.mjs            # dry run
//   node scripts/recover-quarterly-askborsa.mjs --apply    # write + rollback
//   node scripts/recover-quarterly-askborsa.mjs --rollback # undo this script
//
// Verification gate for flow metrics:
//   Q1 + Q2 + Q3 + Q4 must equal FY within 5% (or EGP 1m), and none of Q1..Q3
//   may equal FY (that is the annual-copy signature).  Only then is the quarter
//   treated as a genuine discrete period.
//
// Stock metrics (assets/liabilities/equity) are point-in-time snapshots.  A
// quarter is used only when it differs from FY and is within 10x of FY.
//
// The script never overwrites a value that is not an annual copy.  Unverified
// quarters are reported for review, not quarantined.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { statementKind } from "./lib/statement-kind.mjs"

const db = new PrismaClient()
const HARVEST = "reports/askborsa-harvest.json"
const ROLLBACK = "reports/askborsa-quarterly-rollback.json"
const PLAN = "reports/askborsa-quarterly-plan.json"
const MARK = "ASKBORA_QUARTERLY_RECOVERY:"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")

const ITEM_TO_METRIC = {
  net_profit: "NET_PROFIT",
  gross_profit: "GROSS_PROFIT",
  total_assets: "TOTAL_ASSETS",
  total_liabilities: "TOTAL_LIABILITIES",
  total_equity: "TOTAL_EQUITY",
  total_liabilities_and_equity: "TOTAL_EQUITY_AND_LIABILITIES",
  cf_operating: "OPERATING_CASH_FLOW",
  cf_investing: "INVESTING_CASH_FLOW",
  cf_financing: "FINANCING_CASH_FLOW",
  net_change_in_cash: "NET_CHANGE_IN_CASH",
}
const FLOW = new Set([
  "NET_PROFIT", "GROSS_PROFIT", "OPERATING_CASH_FLOW",
  "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH",
])
const STOCK = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES",
])
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"]

function approx(a, b) {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 0.005, 1)
}
function closeSum(sum, fy) {
  return Math.abs(sum - fy) <= Math.max(Math.abs(fy) * 0.05, 1_000_000)
}

function buildAskBorsaMaps(harvest) {
  const flow = new Map()
  const stock = new Map()
  const rejected = []
  for (const result of harvest.results ?? []) {
    if (result.status !== "ok" || !result.pivots) continue
    const pivots = Object.fromEntries(result.pivots.map((p) => [p.period, p]))
    const fyPivot = pivots.FY
    if (!fyPivot) continue
    for (const year of fyPivot.years ?? []) {
      for (const row of fyPivot.rows ?? []) {
        const metric = ITEM_TO_METRIC[row.item]
        if (!metric) continue
        const fyValue = row.values?.[String(year)]
        if (fyValue === null || fyValue === undefined || !Number.isFinite(Number(fyValue)) || Number(fyValue) === 0) continue
        const fy = Number(fyValue)
        const quarterValues = QUARTERS.map((q) => {
          const qp = pivots[q]
          const qr = qp?.rows?.find((r) => r.item === row.item)
          const v = qr?.values?.[String(year)]
          return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v)
        })

        if (FLOW.has(metric)) {
          if (quarterValues.some((v) => v === null)) continue
          // Annual-copy signature: a Q1..Q3 value identical to FY.
          if (quarterValues.slice(0, 3).some((v) => approx(v, fy))) {
            rejected.push({ ticker: result.ticker, year, metric, reason: "ANNUAL_COPY_IN_Q1_Q3" })
            continue
          }
          // A company that only publishes an annual figure often has zeros in
          // Q1..Q3 and the annual figure in Q4; that is not a discrete series.
          if (quarterValues.slice(0, 3).every((v) => v === 0)) {
            rejected.push({ ticker: result.ticker, year, metric, reason: "NO_DISCRETE_QUARTERS" })
            continue
          }
          const sum = quarterValues.reduce((a, b) => a + b, 0)
          if (!closeSum(sum, fy)) {
            rejected.push({ ticker: result.ticker, year, metric, reason: "SUM_GATE_FAILED", sum, fy })
            continue
          }
          for (let i = 0; i < 4; i++) {
            flow.set(`${result.ticker}|${year}|${QUARTERS[i]}|${metric}`, {
              value: quarterValues[i],
              fy,
              sourceUrl: result.sourceUrl,
              verifiedBy: "SUM_TO_FY",
            })
          }
        } else if (STOCK.has(metric)) {
          for (let i = 0; i < 3; i++) {
            const v = quarterValues[i]
            if (v === null || v === 0) continue
            if (approx(v, fy)) continue
            const ratio = Math.abs(v) / Math.abs(fy)
            if (ratio > 10 || ratio < 0.1) {
              rejected.push({ ticker: result.ticker, year, metric, quarter: QUARTERS[i], reason: "STOCK_SCALE_SUSPECT", value: v, fy })
              continue
            }
            stock.set(`${result.ticker}|${year}|${QUARTERS[i]}|${metric}`, {
              value: v,
              fy,
              sourceUrl: result.sourceUrl,
              verifiedBy: "POINT_IN_TIME",
            })
          }
          // Q4 stock is the annual balance sheet. It is filled from the app's
          // own annual report (not from AskBorsa) in the plan below, so that a
          // provider scale difference can never overwrite a trusted value.
        }
      }
    }
  }
  return { flow, stock, rejected }
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let reverted = 0
  let deleted = 0
  let skipped = 0
  for (const row of data.corrections ?? []) {
    const current = await db.financialValue.findUnique({ where: { id: row.id } })
    if (!current) { skipped++; continue }
    if (current.correctedBy !== "ASKBORA_QUARTERLY_RECOVERY" || !approx(current.normalizedValue, row.newValue)) {
      skipped++; continue
    }
    await db.financialValue.update({
      where: { id: row.id },
      data: {
        value: row.oldValue,
        normalizedValue: row.oldValue,
        originalValue: row.hadOriginalValue ? row.originalValueBefore : null,
        isManuallyCorrected: row.hadOriginalValue ? current.isManuallyCorrected : false,
        correctedBy: null,
        correctedAt: null,
        correctionReason: null,
        validationNotes: row.oldValidationNotes,
        validationStatus: row.oldValidationStatus,
      },
    })
    reverted++
  }
  for (const row of data.created ?? []) {
    const current = await db.financialValue.findUnique({ where: { id: row.id } })
    if (!current) { skipped++; continue }
    if (!String(current.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.delete({ where: { id: row.id } })
    deleted++
  }
  console.log(`rollback complete: reverted=${reverted}, deleted=${deleted}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()

  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"))
  const { flow, stock, rejected } = buildAskBorsaMaps(harvest)
  console.log(`AskBorsa verified flow slots: ${flow.size}; stock slots: ${stock.size}; rejected series: ${rejected.length}`)

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true },
  })
  const byTicker = new Map(companies.map((c) => [c.ticker, c]))
  const byId = new Map(companies.map((c) => [c.id, c]))

  const reports = await db.financialReport.findMany({
    where: {
      companyId: { in: companies.map((c) => c.id) },
      deletedAt: null,
      isDemoData: false,
      processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] },
      periodType: { in: ["ANNUAL", "QUARTERLY"] },
    },
    select: {
      id: true, companyId: true, periodType: true, periodLabel: true, fiscalYear: true,
      periodEnd: true, statementType: true, version: true, supersedesId: true, createdAt: true,
      values: {
        select: {
          id: true, metricCode: true, subPeriod: true, value: true, normalizedValue: true,
          originalValue: true, isManuallyCorrected: true, validationStatus: true, validationNotes: true,
        },
      },
    },
  })

  const superseded = new Set(reports.map((r) => r.supersedesId).filter(Boolean))
  const live = reports
    .filter((r) => !superseded.has(r.id))
    .sort((a, b) => (b.version - a.version) || (b.periodEnd.getTime() - a.periodEnd.getTime()) || (b.createdAt.getTime() - a.createdAt.getTime()))

  const annualByKey = new Map()
  const quarterly = []
  for (const r of live) {
    if (r.statementType !== "CONSOLIDATED") continue
    if (r.periodType === "ANNUAL") {
      const key = `${r.companyId}|${r.fiscalYear}`
      if (!annualByKey.has(key)) annualByKey.set(key, r)
    } else if (r.periodType === "QUARTERLY") {
      quarterly.push(r)
    }
  }

  const plan = []
  const review = []
  for (const report of quarterly) {
    const company = byId.get(report.companyId)
    if (!company) continue
    const m = /^Q([1-4])/.exec(report.periodLabel)
    if (!m) continue
    const quarter = `Q${m[1]}`
    const annual = annualByKey.get(`${report.companyId}|${report.fiscalYear}`)
    if (!annual) continue
    const annualValues = new Map()
    for (const v of annual.values) {
      if (v.subPeriod !== "CURRENT" && v.subPeriod !== null) continue
      annualValues.set(v.metricCode, v.normalizedValue)
    }
    const existing = new Map()
    for (const v of report.values) {
      if (v.subPeriod !== "CURRENT" && v.subPeriod !== null) continue
      existing.set(v.metricCode, v)
    }

    for (const metric of new Set([...FLOW, ...STOCK])) {
      const key = `${company.ticker}|${report.fiscalYear}|${quarter}|${metric}`
      const verified = flow.get(key) ?? stock.get(key)
      const ex = existing.get(metric)
      const fy = annualValues.get(metric)
      const isStock = STOCK.has(metric)

      // Q4 stock is the annual balance sheet. Fill a missing line from the
      // app's own annual report; never replace an existing Q4 value.
      if (!verified && isStock && quarter === "Q4") {
        if (!ex && fy !== undefined && fy !== null) {
          plan.push({
            action: "CREATE",
            ticker: company.ticker,
            companyId: company.id,
            reportId: report.id,
            fiscalYear: report.fiscalYear,
            quarter,
            metric,
            value: fy,
            sourceUrl: annual.sourceUrl ?? null,
            verifiedBy: "Q4_EQUALS_APP_FY",
            reason: "MISSING_Q4_BALANCE_SHEET",
          })
        }
        continue
      }
      if (!verified) continue

      // A provider scale difference is not an annual-copy error. Flag it and
      // leave the app value untouched.
      if (fy !== undefined && fy !== null && fy !== 0 && verified.fy) {
        const fyRatio = Math.abs(verified.fy) / Math.abs(fy)
        if (fyRatio > 10 || fyRatio < 0.1) {
          review.push({
            ticker: company.ticker, fiscalYear: report.fiscalYear, quarter, metric,
            valueId: ex?.id ?? null, value: ex?.normalizedValue ?? null, askValue: verified.value,
            appFy: fy, askFy: verified.fy,
            reason: "ASK_SCALE_VS_APP_FY",
          })
          continue
        }
      }
      if (isStock && fy !== undefined && fy !== null && fy !== 0) {
        const ratio = Math.abs(verified.value) / Math.abs(fy)
        if (ratio > 10 || ratio < 0.1) {
          review.push({
            ticker: company.ticker, fiscalYear: report.fiscalYear, quarter, metric,
            valueId: ex?.id ?? null, value: ex?.normalizedValue ?? null, askValue: verified.value, appFy: fy,
            reason: "STOCK_SCALE_VS_APP_FY",
          })
          continue
        }
      }

      if (!ex) {
        plan.push({
          action: "CREATE",
          ticker: company.ticker,
          companyId: company.id,
          reportId: report.id,
          fiscalYear: report.fiscalYear,
          quarter,
          metric,
          value: verified.value,
          sourceUrl: verified.sourceUrl,
          verifiedBy: verified.verifiedBy,
          reason: "MISSING_QUARTER",
        })
        continue
      }

      if (isStock && quarter === "Q4") continue
      if (fy === undefined || fy === null) continue
      if (!approx(ex.normalizedValue, fy)) continue
      if (approx(ex.normalizedValue, verified.value)) continue
      plan.push({
        action: "CORRECT",
        ticker: company.ticker,
        companyId: company.id,
        reportId: report.id,
        valueId: ex.id,
        fiscalYear: report.fiscalYear,
        quarter,
        metric,
        oldValue: ex.normalizedValue,
        value: verified.value,
        sourceUrl: verified.sourceUrl,
        verifiedBy: verified.verifiedBy,
        oldValidationNotes: ex.validationNotes,
        oldValidationStatus: ex.validationStatus,
        hadOriginalValue: ex.originalValue !== null,
        originalValueBefore: ex.originalValue,
        reason: "ANNUAL_COPY_REPLACED",
      })
    }

    // Review-only: annual copies with no verified AskBorsa replacement.
    for (const [metric, ex] of existing) {
      if (!FLOW.has(metric) && !STOCK.has(metric)) continue
      if (STOCK.has(metric) && quarter === "Q4") continue
      const fy = annualValues.get(metric)
      if (fy === undefined || fy === null) continue
      if (!approx(ex.normalizedValue, fy)) continue
      const key = `${company.ticker}|${report.fiscalYear}|${quarter}|${metric}`
      if (flow.has(key) || stock.has(key)) continue
      review.push({
        ticker: company.ticker, fiscalYear: report.fiscalYear, quarter, metric,
        valueId: ex.id, value: ex.normalizedValue, reason: "ANNUAL_COPY_NO_VERIFIED_REPLACEMENT",
      })
    }
  }

  const byAction = {}
  const byMetric = {}
  for (const p of plan) {
    byAction[p.action] = (byAction[p.action] ?? 0) + 1
    byMetric[p.metric] = (byMetric[p.metric] ?? 0) + 1
  }
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`planned writes: ${plan.length}; by action: ${JSON.stringify(byAction)}; by metric: ${JSON.stringify(byMetric)}`)
  console.log(`review-only annual copies: ${review.length}`)
  console.log(`sample plan: ${JSON.stringify(plan.slice(0, 8), null, 2)}`)
  console.log(`sample review: ${JSON.stringify(review.slice(0, 8), null, 2)}`)

  mkdirSync("reports", { recursive: true })
  writeFileSync(PLAN, JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: HARVEST,
    plan, review, rejected: rejected.slice(0, 5000),
  }, null, 2), "utf8")
  console.log(`dry run / plan: ${PLAN}`)

  if (!APPLY) return

  const rollback = { generatedAt: new Date().toISOString(), corrections: [], created: [] }
  let corrected = 0
  let created = 0
  for (const p of plan) {
    if (p.action === "CORRECT") {
      const current = await db.financialValue.findUnique({ where: { id: p.valueId } })
      if (!current || !approx(current.normalizedValue, p.oldValue)) continue
      await db.financialValue.update({
        where: { id: p.valueId },
        data: {
          value: p.value,
          normalizedValue: p.value,
          originalValue: p.originalValueBefore ?? p.oldValue,
          isManuallyCorrected: true,
          correctedBy: "ASKBORA_QUARTERLY_RECOVERY",
          correctedAt: new Date(),
          correctionReason: `Annual-copy ${p.quarter} ${p.metric} replaced with verified AskBorsa discrete quarter (${p.verifiedBy}); source ${p.sourceUrl}`,
          validationNotes: `${MARK} annual-copy quarter replaced by verified AskBorsa ${p.quarter} ${p.fiscalYear} value; ${p.verifiedBy}. Source: ${p.sourceUrl}`,
          validationStatus: "VALID",
        },
      })
      rollback.corrections.push({
        id: p.valueId, ticker: p.ticker, fiscalYear: p.fiscalYear, quarter: p.quarter,
        metric: p.metric, oldValue: p.oldValue, newValue: p.value,
        oldValidationNotes: p.oldValidationNotes, oldValidationStatus: p.oldValidationStatus,
        hadOriginalValue: p.hadOriginalValue, originalValueBefore: p.originalValueBefore,
      })
      corrected++
    } else {
      const exists = await db.financialValue.findFirst({
        where: { reportId: p.reportId, metricCode: p.metric, subPeriod: "CURRENT" },
        select: { id: true },
      })
      if (exists) continue
      const row = await db.financialValue.create({
        data: {
          companyId: p.companyId,
          reportId: p.reportId,
          metricCode: p.metric,
          originalLabel: `${p.metric} (AskBorsa ${p.quarter} ${p.fiscalYear})`,
          value: p.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: p.value,
          statementType: statementKind(p.metric),
          subPeriod: "CURRENT",
          extractionMethod: "ASKBORA_QUARTERLY",
          confidence: 0.85,
          validationStatus: "VALID",
          validationNotes: `${MARK} only-missing verified AskBorsa discrete quarter; ${p.verifiedBy}. Source: ${p.sourceUrl}`,
          sourceText: p.sourceUrl,
        },
        select: { id: true },
      })
      rollback.created.push({
        id: row.id, ticker: p.ticker, fiscalYear: p.fiscalYear, quarter: p.quarter,
        metric: p.metric, value: p.value,
      })
      created++
    }
  }

  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialValue",
      details: `ASKBORA_QUARTERLY_RECOVERY: ${corrected} annual-copy values corrected, ${created} missing quarterly values created; ${review.length} annual copies left for review; rollback ${ROLLBACK}`,
    },
  })
  console.log(`corrected: ${corrected}; created: ${created}; rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ASK BORSA QUARTERLY RECOVERY FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
