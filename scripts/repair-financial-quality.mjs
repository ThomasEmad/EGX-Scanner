// Financial data quality repair (one file).
//
//   node scripts/repair-financial-quality.mjs                       # DRY RUN report
//   node scripts/repair-financial-quality.mjs --apply               # write (+ rollback + audit)
//   node scripts/repair-financial-quality.mjs --tickers=ABUK,COMI   # restrict
//   node scripts/repair-financial-quality.mjs --rollback            # undo last --apply
//
// Three repairs, all conservative:
//
// A) stale parallel-row cleanup — the old "display-rounded" scraper stored the
//    current-column value under subPeriod "Q1".."Q4"/"H1"/"9M"; the new sync
//    stores it under "CURRENT". The financials API and the AI snapshot read
//    every row and let the last one win, so both families compete for the same
//    cell. When a CURRENT row exists for (report, metric), every tagged sibling
//    is the stale copy → delete it (logged to the rollback file).
//    Tagged-only slots are KEPT (they are the only data there).
//
// B) impossible-value quarantine — an interim CURRENT value whose magnitude is
//    >25× the median of the company's own annuals of the same metric within
//    ±1 fiscal year cannot be a real statement figure (live case: MAAL Q4 2022
//    TOTAL_ASSETS 2.53 TRILLION vs 5.27B annuals — a units bug). Mark
//    validationStatus = "NEEDS_REVIEW" (non-destructive): the financials API,
//    AI snapshot and recompute engine all exclude non-VALID values.
//
// B3) profit-statement volatility quarantine — cash-flow metrics are legitimately
//    lumpy (financing rounds, capex), but GROSS_PROFIT-class metrics are bounded
//    by revenue economics: a quarter >8× the company's own interim median for
//    that metric (≥8 observations) is nearly always a pipeline error
//    (live case: ABUK Q2/Q3 2024 GROSS_PROFIT −36.5B / +41.4B vs 2.78B median
//    — askborsa's misaligned columns). Cash-flow metrics are deliberately NOT
//    covered here; they go to the admin review list instead.
//
// C) crossquarter Q1 derivation — askborsa replaces missing quarters (usually
//    Q1) with the FY value, so Q1 reports sit empty while FY+Q2+Q3+Q4 are all
//    known exactly. Derive Q1 = FY − Q2 − Q3 − Q4 (arithmetically exact) and
//    fill the empty slots, gated by: no real Q1 value contradicting it (>2%),
//    scale sanity vs the company's annuals, and a prior-year Q1 ratio band
//    [0.05, 20] when the prior year's Q1 exists.
//
// D) precision upgrade — legacy scrapers stored display-rounded values
//    (0.01M buckets) as CURRENT. When the fresh snapshot carries the exact
//    value for the same slot and the gap is ≤0.5% (pure rounding, not a
//    restatement), update the stored value to the exact figure.
import { PrismaClient } from "@prisma/client"
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"

const db = new PrismaClient()

const ROLLBACK = "reports/finqual-rollback.json"
const MARK = "FINQUAL:"
const SNAPSHOT = "reports/askborsa-sync-snapshot.json"
const CURRENT_YEAR = new Date().getUTCFullYear()

const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")
const tickersArg = process.argv.find((a) => a.startsWith("--tickers="))
const ONLY_TICKERS = tickersArg ? tickersArg.split("=")[1].split(",").map((t) => t.trim().toUpperCase()).filter(Boolean) : null

const FLOW_METRICS = new Set(["NET_PROFIT", "GROSS_PROFIT", "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH", "REVENUE", "COGS", "DIVIDENDS_PAID"])
const TAGGED = /^(Q[1-4]|H[1-2]|9M)$/
// revenue-bounded profit metrics (B3): a quarter >8× the company's own median
// is a pipeline error, not a business event. Cash flows are excluded by design.
const PROFIT_CLASS = new Set(["GROSS_PROFIT", "OPERATING_INCOME", "EBIT", "EBITDA", "PROFIT_BEFORE_TAX"])

function log(...args) {
  console.log(new Date().toISOString().slice(11, 19), ...args)
}

function medianAbs(values) {
  const a = values.filter((v) => Number.isFinite(v) && v !== 0).map(Math.abs).sort((x, y) => x - y)
  if (!a.length) return null
  const mid = Math.floor(a.length / 2)
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2
}

async function inferFiscalStartByTicker(tickers) {
  const companies = await db.company.findMany({ where: { ticker: { in: [...tickers] } }, select: { id: true, ticker: true } })
  const tickerById = new Map(companies.map((c) => [c.id, c.ticker]))
  const annuals = await db.financialReport.findMany({
    where: { companyId: { in: companies.map((c) => c.id) }, periodType: "ANNUAL", deletedAt: null, isDemoData: false, processingStatus: { in: ["APPROVED", "VALIDATED", "EXTRACTED"] } },
    select: { companyId: true, periodEnd: true },
  })
  const votes = new Map()
  for (const a of annuals) {
    const t = tickerById.get(a.companyId)
    if (!t || !a.periodEnd) continue
    const m = a.periodEnd.getUTCMonth() + 1
    const v = votes.get(t) ?? new Map()
    v.set(m, (v.get(m) ?? 0) + 1)
    votes.set(t, v)
  }
  const out = new Map()
  for (const [t, v] of votes) {
    let best = null
    for (const [m, n] of v) if (!best || n > best.n) best = { m, n }
    out.set(t, (best.m % 12) + 1)
  }
  return out
}

function periodEnd(periodKey, year, startMonth) {
  const sm = startMonth && startMonth >= 1 && startMonth <= 12 ? startMonth : 1
  const startYear = sm === 1 ? year : year - 1
  const monthAfter = sm - 1 + { fy: 12, q1: 3, q2: 6, q3: 9, q4: 12 }[periodKey]
  return new Date(Date.UTC(startYear, monthAfter, 0))
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) { console.error(`No rollback file at ${ROLLBACK}`); process.exit(1) }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let restored = 0, unmarked = 0, deleted = 0, skipped = 0
  for (const v of data.derivedValues ?? []) {
    const row = await db.financialValue.findFirst({ where: { id: v.id, validationNotes: { startsWith: MARK } }, select: { id: true } })
    if (!row) { skipped++; continue }
    await db.financialValue.delete({ where: { id: v.id } })
    deleted++
  }
  for (const v of data.markedValues ?? []) {
    const row = await db.financialValue.findUnique({ where: { id: v.id }, select: { validationStatus: true, validationNotes: true } })
    if (!row || !String(row.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.update({ where: { id: v.id }, data: { validationStatus: v.from, validationNotes: row.validationNotes.replace(MARK, "") } })
    unmarked++
  }
  for (const u of data.upgradedValues ?? []) {
    const row = await db.financialValue.findUnique({ where: { id: u.id }, select: { validationNotes: true } })
    if (!row || !String(row.validationNotes ?? "").startsWith(MARK)) { skipped++; continue }
    await db.financialValue.update({ where: { id: u.id }, data: { value: u.from, normalizedValue: u.from, validationNotes: row.validationNotes.replace(MARK, "") } })
    restored++
  }
  for (const v of data.deletedRows ?? []) {
    const exists = await db.financialValue.findUnique({ where: { id: v.id }, select: { id: true } })
    if (exists) { skipped++; continue }
    const { id, ...payload } = v.row
    await db.financialValue.create({ data: payload })
    restored++
  }
  console.log(`rollback complete: restored=${restored}, unmarked=${unmarked}, derivedDeleted=${deleted}, skipped=${skipped}`)
}

// ---------------------------------------------------------------- main repair
async function repair() {
  const companies = await db.company.findMany({
    where: { isActive: true, ...(ONLY_TICKERS ? { ticker: { in: ONLY_TICKERS } } : {}) },
    select: { id: true, ticker: true },
    orderBy: { ticker: "asc" },
  })
  const companyById = new Map(companies.map((c) => [c.id, c]))
  const companyIds = companies.map((c) => c.id)

  const reports = await db.financialReport.findMany({
    where: {
      companyId: { in: companyIds },
      deletedAt: null, isDemoData: false,
      processingStatus: { notIn: ["FAILED", "REJECTED", "DELETED"] },
      periodType: { in: ["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] },
      statementType: "CONSOLIDATED",
    },
    select: {
      id: true, companyId: true, periodType: true, periodLabel: true, fiscalYear: true,
      periodEnd: true, supersedesId: true,
      values: { select: { id: true, metricCode: true, value: true, normalizedValue: true, subPeriod: true, originalLabel: true, currency: true, unit: true, statementType: true, extractionMethod: true, confidence: true, validationStatus: true, validationNotes: true, sourceText: true, isDemoData: true, createdAt: true } },
    },
  })
  const superseded = new Set(reports.map((r) => r.supersedesId).filter(Boolean))
  const active = reports.filter((r) => !superseded.has(r.id))
  log(`reports scanned: ${reports.length} (active: ${active.length})`)

  const rollback = { generatedAt: new Date().toISOString(), deletedRows: [], markedValues: [], derivedValues: [], upgradedValues: [] }
  let deleteCount = 0, markCount = 0, deriveCount = 0

  // ---- A) stale parallel-row cleanup ---------------------------------------
  for (const r of active) {
    const byMetric = new Map()
    for (const v of r.values) {
      const arr = byMetric.get(v.metricCode) ?? []
      arr.push(v)
      byMetric.set(v.metricCode, arr)
    }
    for (const [metric, rows] of byMetric) {
      const current = rows.find((v) => v.subPeriod === "CURRENT" || v.subPeriod === null)
      if (!current) continue
      const stale = rows.filter((v) => v !== current && TAGGED.test(v.subPeriod ?? ""))
      for (const v of stale) {
        rollback.deletedRows.push({ id: v.id, ticker: companyById.get(r.companyId)?.ticker, reportLabel: r.periodLabel, metric, row: v })
        deleteCount++
      }
    }
  }
  log(`A) stale tagged rows to delete (CURRENT exists): ${deleteCount}`)

  // ---- B) impossible-value quarantine --------------------------------------
  const annualByCompanyMetric = new Map() // companyId|metric -> [{fy, |v|}]
  for (const r of active) {
    if (r.periodType !== "ANNUAL") continue
    for (const v of r.values.filter((x) => (x.subPeriod === "CURRENT" || x.subPeriod === null) && x.validationStatus === "VALID")) {
      const key = `${r.companyId}|${v.metricCode}`
      const arr = annualByCompanyMetric.get(key) ?? []
      arr.push({ fy: r.fiscalYear, abs: Math.abs(v.normalizedValue) })
      annualByCompanyMetric.set(key, arr)
    }
  }
  for (const r of active) {
    if (r.periodType === "ANNUAL") continue
    for (const v of r.values.filter((x) => (x.subPeriod === "CURRENT" || x.subPeriod === null) && x.validationStatus === "VALID")) {
      const refs = annualByCompanyMetric.get(`${r.companyId}|${v.metricCode}`)
      if (!refs?.length) continue
      const near = refs.filter((a) => Math.abs(a.fy - r.fiscalYear) <= 1)
      if (near.length < 1) continue
      const med = medianAbs(near.map((a) => a.abs))
      if (!med) continue
      const ratio = Math.abs(v.normalizedValue) / med
      if (ratio > 25) {
        rollback.markedValues.push({ id: v.id, ticker: companyById.get(r.companyId)?.ticker, reportLabel: r.periodLabel, metric: v.metricCode, value: v.normalizedValue, annualMedian: med, ratio: Number(ratio.toExponential(2)), from: v.validationStatus })
        markCount++
      }
    }
  }
  log(`B) impossible values to mark NEEDS_REVIEW: ${markCount}`)

  // ---- B3) profit-class volatility quarantine -------------------------------
  const interimSeries = new Map() // companyId|metric -> [{ id, v, status }]
  for (const r of active) {
    if (r.periodType === "ANNUAL") continue
    for (const v of r.values.filter((x) => (x.subPeriod === "CURRENT" || x.subPeriod === null) && PROFIT_CLASS.has(x.metricCode) && x.normalizedValue !== 0)) {
      const k = `${r.companyId}|${v.metricCode}`
      const arr = interimSeries.get(k) ?? []
      arr.push({ id: v.id, v: v.normalizedValue, status: v.validationStatus, reportLabel: r.periodLabel })
      interimSeries.set(k, arr)
    }
  }
  let mark3Count = 0
  for (const [k, arr] of interimSeries) {
    if (arr.length < 8) continue
    const med = medianAbs(arr.map((x) => Math.abs(x.v)))
    if (!med) continue
    for (const x of arr) {
      if (x.status !== "VALID") continue
      const ratio = Math.abs(x.v) / med
      if (ratio > 8) {
        const [companyId, metric] = k.split("|")
        rollback.markedValues.push({ id: x.id, ticker: companyById.get(companyId)?.ticker, reportLabel: x.reportLabel, metric, value: x.v, annualMedian: med, ratio: Number(ratio.toExponential(2)), from: x.status, rule: "B3_PROFIT_VOLATILITY" })
        mark3Count++
      }
    }
  }
  log(`B3) profit-class volatility values to mark (>8x company interim median): ${mark3Count}`)
  markCount += mark3Count

  // ---- C) crossquarter Q1 derivation (from the askborsa snapshot) ----------
  let derivedPlan = []
  const periodBuckets = new Map() // ticker|periodKey -> bucket (for D)
  const tickerOfResult = new Map()
  if (existsSync(SNAPSHOT)) {
    const snapshot = JSON.parse(readFileSync(SNAPSHOT, "utf8"))
    for (const res of snapshot.results) {
      if (res.status !== "ok") continue
      for (const [key, bucket] of Object.entries(res.periods ?? {})) periodBuckets.set(`${res.ticker}|${key}`, bucket)
    }
    const fiscalByTicker = await inferFiscalStartByTicker(new Set(companies.map((c) => c.ticker)))
    const dbCompaniesByTicker = new Map(companies.map((c) => [c.ticker, c]))
    const interimByLabel = new Map() // companyId|label -> report
    for (const r of active) {
      if (r.periodType === "ANNUAL") continue
      interimByLabel.set(`${r.companyId}|${r.periodLabel}`, r)
    }
    const derivedByTickerYearMetric = new Map() // for prior-year anchors

    for (const res of snapshot.results) {
      if (res.status !== "ok") continue
      const company = dbCompaniesByTicker.get(res.ticker)
      if (!company) continue
      if (res.currency && res.currency !== "EGP") continue
      const sm = fiscalByTicker.get(res.ticker) ?? res.fiscalYearStartMonth ?? 1

      // per fiscal year: exact snapshot values for fy/q2/q3/q4/q1
      const years = new Map()
      for (const [key, bucket] of Object.entries(res.periods)) {
        const [t, yStr] = key.split("-")
        const y = Number(yStr)
        if (!Number.isFinite(y) || y < 2015 || y > CURRENT_YEAR + 1) continue
        if (!years.has(y)) years.set(y, {})
        years.get(y)[t] = bucket
      }
      const yearsAsc = [...years.entries()].sort((a, b) => a[0] - b[0])
      for (const [y, rec] of yearsAsc) {
        const q1End = periodEnd("q1", y, sm)
        if (q1End.getTime() > Date.now() + 86_400_000) continue
        const report = interimByLabel.get(`${company.id}|Q1 ${y}`)
        if (!report) continue
        const have = new Set(report.values.filter((v) => v.subPeriod === "CURRENT" || v.subPeriod === null).map((v) => v.metricCode))
        const fyBucket = rec.fy ?? {}
        for (const [metric, fyV] of Object.entries(fyBucket)) {
          // only FLOW metrics are additive across quarters — balance-sheet
          // stocks are point-in-time and must NEVER be "derived" by subtraction
          if (!FLOW_METRICS.has(metric)) continue
          if (!Number.isFinite(fyV?.value) || fyV.value === 0) continue
          if (have.has(metric)) continue
          const q2 = rec.q2?.[metric]?.value
          const q3 = rec.q3?.[metric]?.value
          const q4 = rec.q4?.[metric]?.value
          if (![q2, q3, q4].every((x) => Number.isFinite(x) && x !== 0)) continue
          // any quarter printed with the FY value is askborsa's copy
          // contamination — the identity is then corrupted, skip the derivation
          const fyTol = Math.max(Math.abs(fyV.value) * 0.005, 1)
          if ([q2, q3, q4].some((x) => Math.abs(x - fyV.value) <= fyTol)) continue
          const derived = fyV.value - (q2 + q3 + q4)
          if (!Number.isFinite(derived) || derived === 0) continue
          // askborsa's own Q1 slot: contaminated when it equals FY (ignore);
          // a real, differing Q1 value means restatement ambiguity → skip
          const askQ1 = rec.q1?.[metric]?.value
          const askQ1IsFyCopy = askQ1 !== undefined && Math.abs(askQ1 - fyV.value) <= Math.max(Math.abs(fyV.value) * 0.005, 1)
          if (askQ1 !== undefined && !askQ1IsFyCopy) {
            const relDiff = Math.abs(askQ1 - derived) / Math.max(Math.abs(derived), 1)
            if (relDiff > 0.02) { derivedPlan.push({ ticker: res.ticker, period: `Q1 ${y}`, metric, reason: `ASK_Q1_DIFFERS (${(relDiff * 100).toFixed(1)}%)`, derived, askQ1 }); continue }
          }
          // scale sanity vs the company's own annuals (±1 fy)
          const refs = annualByCompanyMetric.get(`${company.id}|${metric}`)
          if (refs?.length) {
            const near = refs.filter((a) => Math.abs(a.fy - y) <= 1)
            const med = medianAbs((near.length ? near : refs).map((a) => a.abs))
            if (med && (Math.abs(derived) / med > 60 || Math.abs(derived) / med < 0.005)) {
              derivedPlan.push({ ticker: res.ticker, period: `Q1 ${y}`, metric, reason: `SCALE_SUSPECT (${(Math.abs(derived) / med).toExponential(1)}x vs annual)`, derived })
              continue
            }
          }
          // prior-year Q1 anchor (DB or previously derived in this run)
          const prior = derivedByTickerYearMetric.get(`${res.ticker}|${y - 1}|${metric}`)
          if (prior !== undefined && prior !== 0) {
            const ratio = Math.abs(derived) / Math.abs(prior)
            if (ratio < 0.05 || ratio > 20) {
              derivedPlan.push({ ticker: res.ticker, period: `Q1 ${y}`, metric, reason: `PRIOR_RATIO_SUSPECT (${ratio.toFixed(2)}x)`, derived })
              continue
            }
          }
          derivedPlan.push({ ticker: res.ticker, period: `Q1 ${y}`, metric, value: derived, reportId: report.id, companyId: company.id, fiscalYear: y, anchor: prior !== undefined ? "PRIOR_YEAR" : "NO_ANCHOR" })
          derivedByTickerYearMetric.set(`${res.ticker}|${y}|${metric}`, derived)
        }
      }
    }
    const actionable = derivedPlan.filter((d) => d.reportId)
    const rejected = derivedPlan.filter((d) => !d.reportId)
    deriveCount = actionable.length
    log(`C) Q1 derivations: ${deriveCount} to add, ${rejected.length} gated out`)
    const rejReasons = {}
    for (const r of rejected) rejReasons[r.reason.replace(/\s*\(.*\)$/, "")] = (rejReasons[r.reason.replace(/\s*\(.*\)$/, "")] ?? 0) + 1
    if (Object.keys(rejReasons).length) log(`   gate reasons: ${JSON.stringify(rejReasons)}`)
    rollback._derivedPlan = actionable

    // ---- D) precision upgrade (rounded CURRENT → exact snapshot value) -------
    // map "Q1 2025"/"H1 2024"/"9M 2023"-style labels to snapshot period keys
    function labelToKey(label) {
      const m = /^(Q([1-4])|H1|9M)\s+(\d{4})$/.exec(label)
      if (!m) return null
      const t = m[2] ? `q${m[2]}` : (m[1] === "H1" ? "q2" : "q3")
      return `${t}-${m[3]}`
    }
    let upgradeCount = 0
    for (const r of active) {
      if (r.periodType === "ANNUAL") continue
      const key = labelToKey(r.periodLabel)
      if (!key) continue
      const resBuckets = periodBuckets.get(`${companyById.get(r.companyId)?.ticker}|${key}`)
      if (!resBuckets) continue
      for (const v of r.values.filter((x) => (x.subPeriod === "CURRENT" || x.subPeriod === null))) {
        const snap = resBuckets[v.metricCode]?.value
        if (snap === undefined || !Number.isFinite(snap) || snap === 0) continue
        if (v.normalizedValue === snap) continue
        const gap = Math.abs(snap - v.normalizedValue) / Math.abs(snap)
        if (gap > 0.005) continue // rounding only, never restatements
        rollback.upgradedValues.push({ id: v.id, ticker: r.ticker ?? companyById.get(r.companyId)?.ticker, reportLabel: r.periodLabel, metric: v.metricCode, from: v.normalizedValue, to: snap, gapPct: Number((gap * 100).toFixed(3)) })
        upgradeCount++
      }
    }
    log(`D) precision upgrades (rounded → exact): ${upgradeCount}`)
  } else {
    log(`C) no snapshot at ${SNAPSHOT} — Q1 derivation skipped`)
  }

  writeFileSync("reports/finqual-plan.json", JSON.stringify({ generatedAt: new Date().toISOString(), mode: APPLY ? "apply" : "dry-run", deletes: deleteCount, marks: markCount, derivations: deriveCount, upgrades: rollback.upgradedValues.length, derivedPlan: rollback._derivedPlan ?? [], derivedRejected: derivedPlan.filter((d) => !d.reportId), markedSample: rollback.markedValues.slice(0, 40), deletedSample: rollback.deletedRows.slice(0, 20).map((d) => ({ ticker: d.ticker, reportLabel: d.reportLabel, metric: d.metric, old: d.row.normalizedValue })), upgradeSample: rollback.upgradedValues.slice(0, 20) }, null, 2), "utf8")
  log(`wrote reports/finqual-plan.json`)

  if (!APPLY) {
    log("DRY RUN — rerun with --apply to write.")
    return
  }

  // A) delete stale rows
  for (const d of rollback.deletedRows) {
    const row = await db.financialValue.findUnique({ where: { id: d.id }, select: { validationNotes: true, subPeriod: true } })
    if (!row) continue
    const currentExists = await db.financialValue.findFirst({ where: { reportId: (await db.financialValue.findUnique({ where: { id: d.id }, select: { reportId: true } })).reportId, metricCode: d.metric, OR: [{ subPeriod: "CURRENT" }, { subPeriod: null }] }, select: { id: true } })
    if (!currentExists) continue // current vanished meanwhile — keep the tagged row
    await db.financialValue.delete({ where: { id: d.id } })
  }
  // B) mark impossible values
  for (const m of rollback.markedValues) {
    await db.financialValue.update({
      where: { id: m.id },
      data: { validationStatus: "NEEDS_REVIEW", validationNotes: `${MARK} SCALE_IMPOSSIBLE (${m.ratio}x vs annual median) ${m.validationNotes ?? ""}`.slice(0, 500) },
    })
  }
  // D) precision upgrades
  for (const u of rollback.upgradedValues) {
    await db.financialValue.update({
      where: { id: u.id },
      data: { value: u.to, normalizedValue: u.to, validationNotes: `${MARK} PRECISION_UPGRADE ${u.from} → ${u.to}`.slice(0, 500) },
    })
  }
  // C) derived Q1 values
  for (const d of rollback._derivedPlan ?? []) {
    const slot = await db.financialValue.findFirst({ where: { reportId: d.reportId, metricCode: d.metric, OR: [{ subPeriod: "CURRENT" }, { subPeriod: null }] }, select: { id: true } })
    if (slot) continue
    const row = await db.financialValue.create({
      data: {
        companyId: d.companyId,
        reportId: d.reportId,
        metricCode: d.metric,
        originalLabel: d.metric.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" "),
        value: d.value,
        currency: "EGP",
        unit: "UNIT",
        normalizedValue: d.value,
        statementType: metricStatementKind(d.metric),
        subPeriod: "CURRENT",
        extractionMethod: "CROSSQUARTER_DERIVED",
        confidence: d.anchor === "PRIOR_YEAR" ? 0.75 : 0.65,
        validationStatus: "VALID",
        validationNotes: `${MARK} DERIVED Q1 = FY − Q2 − Q3 − Q4 (askborsa exact values${d.anchor === "PRIOR_YEAR" ? "; prior-year Q1 ratio ok" : "; no prior-year anchor"})`,
        isDemoData: false,
      },
      select: { id: true },
    })
    rollback.derivedValues.push({ id: row.id, ticker: d.ticker, period: d.period, metric: d.metric, value: d.value })
  }
  delete rollback._derivedPlan
  writeFileSync(ROLLBACK, JSON.stringify(rollback, null, 2), "utf8")
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "UPLOAD",
      entityType: "FinancialValue",
      details: `FINQUAL: ${deleteCount} stale rows deleted, ${markCount} impossible values marked NEEDS_REVIEW, ${deriveCount} Q1 values derived (Q1 = FY − Q2 − Q3 − Q4), ${rollback.upgradedValues.length} precision upgrades; rollback ${ROLLBACK}`,
    },
  })
  log(`APPLIED: deletes=${deleteCount}, marks=${markCount}, derivations=${deriveCount}, upgrades=${rollback.upgradedValues.length}; rollback → ${ROLLBACK}`)
}

function metricStatementKind(metric) {
  const map = {
    NET_PROFIT: "INCOME_STATEMENT", GROSS_PROFIT: "INCOME_STATEMENT", REVENUE: "INCOME_STATEMENT", COGS: "INCOME_STATEMENT",
    OPERATING_CASH_FLOW: "CASH_FLOW", INVESTING_CASH_FLOW: "CASH_FLOW", FINANCING_CASH_FLOW: "CASH_FLOW",
    NET_CHANGE_IN_CASH: "CASH_FLOW", DIVIDENDS_PAID: "CASH_FLOW",
    TOTAL_ASSETS: "BALANCE_SHEET", TOTAL_LIABILITIES: "BALANCE_SHEET", TOTAL_EQUITY: "BALANCE_SHEET", TOTAL_EQUITY_AND_LIABILITIES: "BALANCE_SHEET",
  }
  return map[metric] ?? "OTHER"
}

const run = ROLLBACK_MODE ? runRollback() : repair()
run
  .catch((e) => { console.error("FINQUAL FAILED:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
