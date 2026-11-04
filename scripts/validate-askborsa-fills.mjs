// Validate the accounting identities of values imported by the AskBorsa
// recovery scripts.  Newly imported values that break a provable identity are
// reversibly quarantined; the source report is left intact.
//
//   node scripts/validate-askborsa-fills.mjs            # dry run
//   node scripts/validate-askborsa-fills.mjs --apply    # quarantine + rollback
//   node scripts/validate-askborsa-fills.mjs --rollback # undo
import { PrismaClient } from "@prisma/client"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const ANNUAL = "reports/askborsa-missing-rollback.json"
const QUARTERLY = "reports/askborsa-quarterly-rollback.json"
const ROLLBACK = "reports/askborsa-fill-validation.json"
const MARK = "AUDIT_QUARANTINE:"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")

const BALANCE = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"]
const CASH = ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH"]

function approx(a, b) {
  return Math.abs(a - b) <= Math.max(Math.abs(b) * 0.02, 2_000_000)
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) { console.error(`No ${ROLLBACK}`); process.exit(1) }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let reverted = 0, skipped = 0
  for (const row of data.quarantined ?? []) {
    const current = await db.financialValue.findUnique({ where: { id: row.id } })
    if (!current) { skipped++; continue }
    if (!String(current.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.update({
      where: { id: row.id },
      data: { validationStatus: row.oldStatus, validationNotes: row.oldNotes },
    })
    reverted++
  }
  console.log(`rollback complete: reverted=${reverted}, skipped=${skipped}`)
}

function pick(values, code) {
  const arr = values.filter((v) =>
    v.metricCode === code &&
    v.validationStatus !== "FAILED" &&
    !String(v.validationNotes ?? "").startsWith(MARK))
  if (!arr.length) return null
  return arr.find((v) => v.subPeriod === "CURRENT") ?? arr[0]
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()
  const created = [
    ...(JSON.parse(readFileSync(ANNUAL, "utf8")).created ?? []),
    ...(JSON.parse(readFileSync(QUARTERLY, "utf8")).created ?? []),
  ]
  const newIds = new Set(created.map((x) => x.id))
  const newValues = await db.financialValue.findMany({
    where: { id: { in: [...newIds] } },
    select: { id: true, reportId: true, metricCode: true, normalizedValue: true },
  })
  const reportIds = [...new Set(newValues.map((v) => v.reportId))]
  const reports = await db.financialReport.findMany({
    where: { id: { in: reportIds } },
    select: {
      id: true, periodLabel: true, fiscalYear: true, periodType: true,
      company: { select: { ticker: true } },
      values: { select: { id: true, metricCode: true, subPeriod: true, normalizedValue: true, validationStatus: true, validationNotes: true } },
    },
  })

  const quarantine = []
  const review = []
  for (const r of reports) {
    const a = pick(r.values, "TOTAL_ASSETS")
    const l = pick(r.values, "TOTAL_LIABILITIES")
    const e = pick(r.values, "TOTAL_EQUITY")
    if (a && l && e) {
      const diff = a.normalizedValue - (l.normalizedValue + e.normalizedValue)
      const tol = Math.max(Math.abs(a.normalizedValue) * 0.02, 2_000_000)
      if (Math.abs(diff) > tol) {
        const nci = pick(r.values, "NON_CONTROLLING_INTERESTS")
        const explained = diff > 0 && nci && Math.abs(diff - nci.normalizedValue) <= Math.max(tol, Math.abs(nci.normalizedValue) * 0.02)
        if (explained) {
          // A = L + E + NCI: identity holds.
        } else if (diff < -tol) {
          // Liabilities + equity exceed assets: this cannot be explained by NCI.
          for (const v of [a, l, e]) {
            if (newIds.has(v.id)) {
              quarantine.push({
                id: v.id, ticker: r.company.ticker, period: r.periodLabel,
                metric: v.metricCode, value: v.normalizedValue,
                reason: "BALANCE_EXCEEDS_ASSETS",
                oldStatus: v.validationStatus, oldNotes: v.validationNotes,
                relabelOnly: v.validationStatus === "NEEDS_REVIEW" && !String(v.validationNotes ?? "").startsWith(MARK),
              })
            }
          }
        } else {
          review.push({
            ticker: r.company.ticker, period: r.periodLabel, type: r.periodType,
            assets: a.normalizedValue, liabilities: l.normalizedValue, equity: e.normalizedValue,
            diff, nci: nci?.normalizedValue ?? null,
            newMetrics: [a, l, e].filter((v) => newIds.has(v.id)).map((v) => v.metricCode),
            reason: "BALANCE_GAP_NOT_EXPLAINED",
          })
        }
      }
    }

    const ocf = pick(r.values, "OPERATING_CASH_FLOW")
    const icf = pick(r.values, "INVESTING_CASH_FLOW")
    const fcf = pick(r.values, "FINANCING_CASH_FLOW")
    const net = pick(r.values, "NET_CHANGE_IN_CASH")
    if (ocf && icf && fcf && net) {
      const legs = ocf.normalizedValue + icf.normalizedValue + fcf.normalizedValue
      const tol = Math.max(
        Math.abs(net.normalizedValue) * 0.02,
        Math.abs(legs) * 0.02,
        2_000_000,
      )
      if (Math.abs(legs - net.normalizedValue) > tol) {
        const legsNew = [ocf, icf, fcf, net].filter((v) => newIds.has(v.id))
        if (legsNew.length === 4) {
          for (const v of legsNew) {
            quarantine.push({
              id: v.id, ticker: r.company.ticker, period: r.periodLabel,
              metric: v.metricCode, value: v.normalizedValue,
              reason: "CASH_FLOW_SUM_MISMATCH",
              oldStatus: v.validationStatus, oldNotes: v.validationNotes,
              relabelOnly: v.validationStatus === "NEEDS_REVIEW" && !String(v.validationNotes ?? "").startsWith(MARK),
            })
          }
        } else {
          review.push({
            ticker: r.company.ticker, period: r.periodLabel, type: r.periodType,
            ocf: ocf.normalizedValue, icf: icf.normalizedValue, fcf: fcf.normalizedValue,
            net: net.normalizedValue, legs, diff: legs - net.normalizedValue,
            newMetrics: legsNew.map((v) => v.metricCode),
            reason: "CASH_FLOW_SUM_MISMATCH_REVIEW",
          })
        }
      }
    }
  }

  // De-duplicate by id.
  const unique = [...new Map(quarantine.map((q) => [q.id, q])).values()]
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  const newQuarantine = unique.filter((q) => !q.relabelOnly).length
  const relabelQuarantine = unique.length - newQuarantine
  console.log(`new values: ${newIds.size}; reports touched: ${reports.length}`)
  console.log(`values to quarantine: ${newQuarantine}; already-quarantined to relabel: ${relabelQuarantine}; review-only gaps: ${review.length}`)
  console.log(`sample quarantine: ${JSON.stringify(unique.slice(0, 12), null, 2)}`)
  console.log(`sample review: ${JSON.stringify(review.slice(0, 12), null, 2)}`)

  writeFileSync("reports/askborsa-fill-validation-plan.json", JSON.stringify({
    generatedAt: new Date().toISOString(), quarantine: unique, review,
  }, null, 2), "utf8")

  if (!APPLY) return
  let changed = 0
  let relabelled = 0
  for (const q of unique) {
    const note = `${MARK} AskBorsa fill failed ${q.reason} in ${q.period}; value quarantined pending a second source. Original status: ${q.oldStatus}.${q.oldNotes ? ` Previous note: ${q.oldNotes}` : ""}`
    if (q.relabelOnly) {
      await db.financialValue.update({
        where: { id: q.id },
        data: { validationNotes: note },
      })
      relabelled++
    } else {
      await db.financialValue.update({
        where: { id: q.id },
        data: { validationStatus: "NEEDS_REVIEW", validationNotes: note },
      })
      changed++
    }
  }
  const existingRollback = existsSync(ROLLBACK) ? JSON.parse(readFileSync(ROLLBACK, "utf8")) : { quarantined: [] }
  const mergedQuarantine = [
    ...(existingRollback.quarantined ?? []).filter((old) => !unique.some((q) => q.id === old.id)),
    ...unique,
  ]
  writeFileSync(ROLLBACK, JSON.stringify({ generatedAt: new Date().toISOString(), quarantined: mergedQuarantine, review }, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "VALIDATE",
      entityType: "FinancialValue",
      details: `ASKBORA_FILL_VALIDATION: ${changed} imported values quarantined for identity failures; ${relabelled} already-quarantined values relabelled; ${review.length} reports left for review. Rollback ${ROLLBACK}`,
    },
  })
  console.log(`quarantined: ${changed}; relabelled: ${relabelled}; rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ASK BORSA FILL VALIDATION FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
