// Fill only-missing annual statement slots from the AskBorsa public pivot.
//
//   node scripts/recover-askborsa-missing.mjs            # dry run
//   node scripts/recover-askborsa-missing.mjs --apply    # write + rollback file
//   node scripts/recover-askborsa-missing.mjs --rollback # undo this script
//
// Rules:
//   - never overwrite an existing metric slot
//   - consolidated annual reports only
//   - no future periodEnd
//   - skip USD-denominated pages (no implicit FX conversion)
//   - scale guard against known AskBorsa thousands/millions errors: the new
//     value must be within 100x of the company's existing annual median for the
//     same metric, when at least two local values exist
//   - every insert is recorded in reports/askborsa-missing-rollback.json
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { statementKind } from "./lib/statement-kind.mjs"

const db = new PrismaClient()
const HARVEST = "reports/askborsa-harvest.json"
const ROLLBACK = "reports/askborsa-missing-rollback.json"
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
  dividends_paid: "DIVIDENDS_PAID",
}

// AskBorsa is known to print these two issuers in thousands in some years.
// Never backfill them from this source; their app values are already anchored
// by official filings.
const BLOCKED_TICKERS = new Set(["BQDC", "IRON"])
const BALANCE_METRICS = new Set([
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES",
])

function isFuture(date) {
  return date.getTime() > Date.now() + 86_400_000
}

function median(nums) {
  if (nums.length === 0) return null
  const a = [...nums].sort((x, y) => x - y)
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) {
    console.error(`No rollback file at ${ROLLBACK}`)
    process.exit(1)
  }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let deleted = 0
  let skipped = 0
  for (const row of data.created ?? []) {
    const current = await db.financialValue.findUnique({ where: { id: row.id }, select: { id: true, normalizedValue: true, validationNotes: true } })
    if (!current) { skipped++; continue }
    if (!String(current.validationNotes ?? "").startsWith("ASKBORA_HARVEST:")) { skipped++; continue }
    await db.financialValue.delete({ where: { id: row.id } })
    deleted++
  }
  console.log(`rollback complete: deleted=${deleted}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()

  const harvest = JSON.parse(readFileSync(HARVEST, "utf8"))
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true, ticker: true, nameEn: true, isin: true,
      _count: { select: { reports: { where: { deletedAt: null } } } },
    },
  })

  // The universe contains a few alternate tickers for the same issuer (for
  // example CANA/SBAG, MASR/MNHD, ESRS/EZDK).  Do not backfill an alias: the
  // canonical row is the one that already carries the disclosure history.
  const normName = (s) =>
    String(s ?? "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w.length > 2 && !["the", "for", "and", "co", "company", "sae", "s"].includes(w))
      .join(" ")
  const aliasOf = new Map()
  const byName = new Map()
  const byIsin = new Map()
  for (const c of companies) {
    const key = normName(c.nameEn)
    if (key) {
      const prev = byName.get(key)
      if (!prev || c._count.reports > prev._count.reports) byName.set(key, c)
    }
    if (c.isin) {
      const prev = byIsin.get(c.isin)
      if (!prev || c._count.reports > prev._count.reports) byIsin.set(c.isin, c)
    }
  }
  for (const c of companies) {
    const canonical = byName.get(normName(c.nameEn)) ?? (c.isin ? byIsin.get(c.isin) : null)
    if (canonical && canonical.id !== c.id) aliasOf.set(c.id, canonical.ticker)
  }

  const byTicker = new Map(companies.map((c) => [c.ticker, c]))

  // Preload annual reports and values for the active universe.
  const reports = await db.financialReport.findMany({
    where: {
      companyId: { in: companies.map((c) => c.id) },
      deletedAt: null,
      periodType: "ANNUAL",
      isDemoData: false,
      processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] },
    },
    select: {
      id: true, companyId: true, fiscalYear: true, periodEnd: true, statementType: true,
      version: true, supersedesId: true, createdAt: true,
      values: { select: { metricCode: true, subPeriod: true, normalizedValue: true, validationStatus: true, validationNotes: true } },
    },
  })
  // Never write into a superseded or older version when a newer one exists.
  const superseded = new Set(reports.map((r) => r.supersedesId).filter(Boolean))
  const canonicalReports = reports
    .filter((r) => !superseded.has(r.id))
    .sort((a, b) => (b.version - a.version) || (b.periodEnd.getTime() - a.periodEnd.getTime()) || (b.createdAt.getTime() - a.createdAt.getTime()))
  const reportByKey = new Map()
  for (const r of canonicalReports) {
    const key = `${r.companyId}|${r.fiscalYear}|${r.statementType}`
    if (!reportByKey.has(key)) reportByKey.set(key, r)
  }
  const annualByCompanyMetric = new Map()
  for (const r of canonicalReports) {
    if (r.statementType !== "CONSOLIDATED") continue
    if (aliasOf.has(r.companyId)) continue
    for (const v of r.values) {
      if (v.validationStatus !== "VALID" || v.normalizedValue === null || v.normalizedValue === 0) continue
      if (String(v.validationNotes ?? "").startsWith("AUDIT_QUARANTINE:")) continue
      const key = `${r.companyId}|${v.metricCode}`
      if (!annualByCompanyMetric.has(key)) annualByCompanyMetric.set(key, [])
      annualByCompanyMetric.get(key).push(v.normalizedValue)
    }
  }

  const plan = []
  const skipped = []
  let existingSlots = 0
  let noReport = 0
  for (const result of harvest.results ?? []) {
    if (result.status !== "ok" || !result.pivots) continue
    const company = byTicker.get(result.ticker)
    if (!company) continue
    if (BLOCKED_TICKERS.has(result.ticker)) {
      skipped.push({ ticker: result.ticker, reason: "KNOWN_SOURCE_SCALE_ERROR" })
      continue
    }
    if (aliasOf.has(company.id)) {
      skipped.push({ ticker: result.ticker, reason: "ALIAS_OF", canonical: aliasOf.get(company.id) })
      continue
    }
    if (result.currency === "USD") {
      skipped.push({ ticker: result.ticker, reason: "USD_DENOMINATED" })
      continue
    }
    const fy = result.pivots.find((p) => p.period === "FY")
    if (!fy) continue
    for (const year of fy.years ?? []) {
      const report = reportByKey.get(`${company.id}|${year}|CONSOLIDATED`)
      if (!report) { noReport++; continue }
      if (report.statementType !== "CONSOLIDATED") continue
      if (isFuture(report.periodEnd)) {
        skipped.push({ ticker: result.ticker, year, reason: "FUTURE_PERIOD" })
        continue
      }
      const existingCodes = new Set(
        report.values
          .filter((v) => v.subPeriod === "CURRENT" || v.subPeriod === null)
          .map((v) => v.metricCode),
      )
      for (const row of fy.rows ?? []) {
        const metric = ITEM_TO_METRIC[row.item]
        if (!metric) continue
        const raw = row.values?.[String(year)]
        if (raw === null || raw === undefined || !Number.isFinite(Number(raw))) continue
        if (existingCodes.has(metric)) { existingSlots++; continue }
        let value = Number(raw)
        if (!Number.isFinite(value) || value === 0) {
          skipped.push({ ticker: result.ticker, year, metric, reason: "ZERO_OR_INVALID" })
          continue
        }

        const anchorsRaw = annualByCompanyMetric.get(`${company.id}|${metric}`) ?? []
        const anchors = anchorsRaw.map((v) => Math.abs(v))
        const med = median(anchors)

        if (metric === "DIVIDENDS_PAID") {
          const signs = new Set(anchorsRaw.map((v) => Math.sign(v)).filter((s) => s !== 0))
          if (anchorsRaw.length === 0) {
            skipped.push({ ticker: result.ticker, year, metric, reason: "NO_DIVIDEND_SIGN_ANCHOR" })
            continue
          }
          if (signs.size !== 1) {
            skipped.push({ ticker: result.ticker, year, metric, reason: "MIXED_DIVIDEND_SIGN" })
            continue
          }
          // Preserve the app's existing sign convention for this company.
          value = Math.abs(value) * [...signs][0]
        }

        if (med !== null && med > 0 && anchors.length >= 2) {
          const ratio = Math.abs(value) / med
          const maxRatio = BALANCE_METRICS.has(metric) ? 10 : 100
          if (ratio > maxRatio || ratio < 1 / maxRatio) {
            skipped.push({
              ticker: result.ticker, year, metric, value,
              reason: "SCALE_SUSPECT", localMedian: med, ratio: Number(ratio.toFixed(4)),
              sourceUrl: result.sourceUrl,
            })
            continue
          }
        }

        plan.push({
          ticker: result.ticker,
          companyId: company.id,
          reportId: report.id,
          year,
          metric,
          item: row.item,
          label: row.label,
          value,
          sourceUrl: result.sourceUrl,
          currency: result.currency ?? "EGP",
          localMedian: med,
        })
      }
    }
  }

  const byMetric = {}
  for (const p of plan) byMetric[p.metric] = (byMetric[p.metric] ?? 0) + 1
  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`missing slots to fill: ${plan.length}`)
  console.log(`existing slots skipped: ${existingSlots}; company-years without annual report: ${noReport}; other skips: ${skipped.length}`)
  console.log(`by metric: ${JSON.stringify(byMetric)}`)
  if (skipped.length) console.log(`sample skips: ${JSON.stringify(skipped.slice(0, 10), null, 2)}`)

  if (!APPLY) {
    writeFileSync("reports/askborsa-missing-plan.json", JSON.stringify({ generatedAt: new Date().toISOString(), plan, skipped }, null, 2), "utf8")
    console.log("dry run: wrote reports/askborsa-missing-plan.json")
    return
  }

  const rollback = { generatedAt: new Date().toISOString(), created: [], skipped }
  let created = 0
  for (const p of plan) {
    // Re-check inside the write loop for idempotency / concurrent runs.
    const exists = await db.financialValue.findFirst({
      where: { reportId: p.reportId, metricCode: p.metric, subPeriod: "CURRENT" },
      select: { id: true },
    })
    if (exists) continue
    try {
      const row = await db.financialValue.create({
        data: {
          companyId: p.companyId,
          reportId: p.reportId,
          metricCode: p.metric,
          originalLabel: `${p.label} (AskBorsa annual FY${p.year})`,
          value: p.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: p.value,
          statementType: statementKind(p.metric),
          subPeriod: "CURRENT",
          extractionMethod: "ASKBORA_HARVEST",
          confidence: p.localMedian === null ? 0.7 : 0.85,
          validationStatus: "VALID",
          validationNotes: `ASKBORA_HARVEST: only-missing annual slot from public AskBorsa pivot; source ${p.sourceUrl}; no overwrite of existing data.`,
          sourceText: p.sourceUrl,
        },
        select: { id: true },
      })
      rollback.created.push({ id: row.id, ticker: p.ticker, year: p.year, metric: p.metric, value: p.value, sourceUrl: p.sourceUrl })
      created++
    } catch (e) {
      rollback.skipped.push({ ticker: p.ticker, year: p.year, metric: p.metric, reason: "CREATE_FAILED", error: e instanceof Error ? e.message : String(e) })
    }
  }

  mkdirSync("reports", { recursive: true })
  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialValue",
      details: `ASKBORA_HARVEST only-missing annual fill: ${created} values created; ${skipped.length} skipped; source reports/askborsa-harvest.json. Rollback: ${ROLLBACK}`,
    },
  })
  console.log(`created: ${created}; rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("ASK BORSA MISSING-FILL FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
