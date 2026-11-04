/**
 * Detect and repair unit-scale errors (values stored 1,000× or 1,000,000× too
 * large). Example: Fawry's FY2016–FY2021 statements were stored with assets of
 * 4.12 trillion EGP because the source reported thousands but the extractor
 * labelled them as units.
 *
 *   node scripts/dq-fix-scale.mjs              # dry run
 *   node scripts/dq-fix-scale.mjs --apply      # write corrections
 *   node scripts/dq-fix-scale.mjs --rollback   # undo every scale fix
 *
 * Method:
 *   1. anchor = median TOTAL_ASSETS of the three most recent annual periods;
 *   2. a report whose total is ≥50× the anchor (and whose corrected value lands
 *      within 5× of the anchor) is a scale error;
 *   3. propagate backwards year by year: if the previous year's total is
 *      ~1,000× the corrected current year, it has the same unit error;
 *   4. inside a flagged report, each value is only divided if it is NOT already
 *      within 50× of that metric's own anchor. Real filings sometimes mix
 *      scales (e.g. a correct cross-check line next to scaled totals).
 *
 * Downward outliers are never touched — genuine shrinkages exist.
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const ACTOR = "audit-scale-fix-v1"

const UNITLESS = /(_PER_SHARE|_EPS|_DPS|_RATIO|_MARGIN|_YIELD|_COUNT|SHARES_OUTSTANDING|TREASURY_SHARES|PAR_VALUE|PRICE_|MARKET_|VOLUME)/

function median(a) {
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

function factorFor(ratio) {
  if (ratio >= 300 && ratio <= 3000) return 1000
  if (ratio >= 3e5 && ratio <= 3e6) return 1_000_000
  return null
}

function unitFactor(unit) {
  switch (unit) {
    case "BILLION": return 1e9
    case "MILLION": return 1e6
    case "THOUSAND": return 1e3
    default: return 1
  }
}

function toDisplay(normalized, unit) {
  return normalized / unitFactor(unit)
}

async function rollback() {
  const rows = await db.financialValue.findMany({
    where: { correctedBy: ACTOR, correctionReason: { startsWith: "AUDIT_SCALE_FIX" } },
    select: { id: true, unit: true, originalValue: true, normalizedValue: true },
  })
  console.log(`\n=== Unit-scale ROLLBACK — ${rows.length} values ===\n`)
  for (const v of rows) {
    if (v.originalValue === null) continue
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        value: v.originalValue,
        normalizedValue: v.originalValue * unitFactor(v.unit),
        originalValue: null,
        isManuallyCorrected: false,
        correctedBy: null,
        correctedAt: null,
        correctionReason: null,
        validationNotes: null,
        validationStatus: "VALID",
      },
    })
  }
  console.log(`restored ${rows.length} values.`)
}

async function scan() {
  console.log(`\n=== Unit-scale repair ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)
  const companies = await db.company.findMany({ select: { id: true, ticker: true } })
  let scanned = 0
  let reportsFixed = 0
  let valuesFixed = 0
  const examples = []

  for (const co of companies) {
    const reports = await db.financialReport.findMany({
      where: { companyId: co.id, deletedAt: null },
      orderBy: [{ fiscalYear: "asc" }, { periodEnd: "asc" }],
      select: {
        id: true, periodLabel: true, periodType: true, fiscalYear: true, sourceName: true, notes: true,
        values: { select: { id: true, metricCode: true, value: true, normalizedValue: true, unit: true, subPeriod: true, originalValue: true, validationStatus: true } },
      },
    })
    const annual = reports.filter(r => r.periodType === "ANNUAL")
    const assetOf = (r) => {
      const v = r.values.find(x => x.metricCode === "TOTAL_ASSETS" && (x.subPeriod ?? "CURRENT") === "CURRENT" && x.validationStatus === "VALID")
      return v && v.normalizedValue > 0 ? v.normalizedValue : null
    }
    const valuesByYear = annual.map(r => ({ report: r, assets: assetOf(r) })).filter(x => x.assets !== null)
    valuesByYear.sort((a, b) => a.report.fiscalYear - b.report.fiscalYear)
    if (valuesByYear.length < 2) continue

    const recent = valuesByYear.slice(-3)
    const anchor = median(recent.map(x => x.assets))
    if (!(anchor > 0)) continue

    const plan = new Map() // reportId -> { factor, correctedAssets, trigger }
    for (const x of valuesByYear) {
      const ratio = x.assets / anchor
      if (ratio < 50) continue
      const factor = factorFor(ratio) ?? (ratio >= 300 ? 1000 : null)
      if (!factor) continue
      const corrected = x.assets / factor
      if (corrected < anchor * 0.02 || corrected > anchor * 5) continue
      plan.set(x.report.id, { factor, correctedAssets: corrected, trigger: `TOTAL_ASSETS ${x.assets.toExponential(3)} vs anchor ${anchor.toExponential(3)}` })
    }

    // propagate backwards through the annual series
    let nextCorrected = null
    for (let i = valuesByYear.length - 1; i >= 0; i--) {
      const x = valuesByYear[i]
      const existing = plan.get(x.report.id)
      if (existing) {
        nextCorrected = existing.correctedAssets
        continue
      }
      if (nextCorrected !== null) {
        const ratio = x.assets / nextCorrected
        const factor = factorFor(ratio)
        if (factor) {
          const corrected = x.assets / factor
          if (corrected >= nextCorrected * 0.2 && corrected <= nextCorrected * 5) {
            plan.set(x.report.id, { factor, correctedAssets: corrected, trigger: `previous-year chain ${x.assets.toExponential(3)} ÷ ${nextCorrected.toExponential(3)}` })
            nextCorrected = corrected
            continue
          }
        }
      }
      // A normal year ends the chain: older periods are not re-scaled.
      nextCorrected = null
    }

    // adjacency pass: catch a year that is ~1,000× its already-correct neighbour
    for (let i = 1; i < valuesByYear.length; i++) {
      const older = valuesByYear[i - 1]
      const newer = valuesByYear[i]
      if (!plan.has(older.report.id)) {
        const factor = factorFor(older.assets / newer.assets)
        if (factor) {
          const corrected = older.assets / factor
          if (corrected >= newer.assets * 0.1 && corrected <= newer.assets * 10) {
            plan.set(older.report.id, { factor, correctedAssets: corrected, trigger: `adjacent-year ${older.assets.toExponential(3)} ÷ ${newer.assets.toExponential(3)}` })
          }
        }
      }
      if (!plan.has(newer.report.id)) {
        const factor = factorFor(newer.assets / older.assets)
        if (factor) {
          const corrected = newer.assets / factor
          if (corrected >= older.assets * 0.1 && corrected <= older.assets * 10) {
            plan.set(newer.report.id, { factor, correctedAssets: corrected, trigger: `adjacent-year ${newer.assets.toExponential(3)} ÷ ${older.assets.toExponential(3)}` })
          }
        }
      }
    }

    if (plan.size === 0) continue

    // Per-metric anchors from annual reports that are NOT being re-scaled.
    const metricAnchor = new Map()
    for (const r of annual) {
      if (plan.has(r.id)) continue
      for (const v of r.values) {
        if ((v.subPeriod ?? "CURRENT") !== "CURRENT" || v.validationStatus !== "VALID" || v.normalizedValue === 0) continue
        if (!metricAnchor.has(v.metricCode)) metricAnchor.set(v.metricCode, [])
        metricAnchor.get(v.metricCode).push(v.normalizedValue)
      }
    }
    for (const [k, a] of metricAnchor) metricAnchor.set(k, median(a.slice(-3)))

    for (const r of reports) {
      scanned++
      const p = plan.get(r.id)
      if (!p) continue
      const affected = []
      for (const v of r.values) {
        if (UNITLESS.test(v.metricCode) || v.normalizedValue === 0) continue
        const a = metricAnchor.get(v.metricCode)
        // Already in the right ballpark: leave it (mixed-scale filings).
        if (a && v.normalizedValue >= a * 0.02 && v.normalizedValue <= a * 10 && v.normalizedValue !== 0) continue
        const corrected = v.normalizedValue / p.factor
        if (a && (corrected < a * 0.02 || corrected > a * 10)) continue
        affected.push({ v, corrected })
      }
      if (affected.length === 0) continue
      reportsFixed++
      valuesFixed += affected.length
      if (examples.length < 25) examples.push(`${co.ticker} ${r.periodLabel} ÷${p.factor} (${p.trigger}; ${affected.length}/${r.values.length} values, ${r.sourceName})`)

      if (APPLY) {
        for (const { v, corrected } of affected) {
          await db.financialValue.update({
            where: { id: v.id },
            data: {
              value: toDisplay(corrected, v.unit),
              normalizedValue: corrected,
              originalValue: v.originalValue ?? v.value,
              isManuallyCorrected: true,
              correctedBy: ACTOR,
              correctedAt: new Date(),
              correctionReason: `AUDIT_SCALE_FIX: source values were ${p.factor}× too large (${p.trigger})`,
              validationNotes: `AUDIT_SCALE_FIX: divided by ${p.factor} — original ${v.normalizedValue}`,
              validationStatus: "VALID",
            },
          })
        }
        await db.financialReport.update({
          where: { id: r.id },
          data: { notes: `${r.notes ? r.notes + " | " : ""}AUDIT_SCALE_FIX: ${affected.length} monetary values divided by ${p.factor} (${p.trigger})` },
        })
      }
    }
  }

  console.log(`reports scanned: ${scanned}`)
  console.log(`reports to repair: ${reportsFixed} | monetary values: ${valuesFixed}`)
  console.log(`\nexamples:\n  ${examples.join("\n  ") || "(none)"}`)
  console.log(APPLY ? "\nChanges written." : "\nDry run — re-run with --apply.")
}

if (ROLLBACK) rollback().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
else scan().catch(e => { console.error(e); process.exitCode = 1 }).finally(() => db.$disconnect())
