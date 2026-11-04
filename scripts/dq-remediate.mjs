/**
 * Deterministic, audited remediation of provable accounting errors.
 *
 *   node scripts/dq-remediate.mjs           # dry run
 *   node scripts/dq-remediate.mjs --apply   # write corrections
 *
 * Only corrects cases where the original value is *provably* wrong under an
 * accounting identity:
 *
 *   A) TOTAL_LIABILITIES mapped to total assets or total assets + equity
 *      → correct to A − E   (TEAL agrees with A, or L ≈ A / A+E)
 *   B) TOTAL_DEBT lower than ST + LT by >2% (components are subsets)
 *      → correct to ST + LT
 *   C) GROSS_PROFIT stored with the opposite sign of REVENUE − |COGS|
 *      → correct sign
 *   D) TOTAL_EQUITY_AND_LIABILITIES cross-check disagrees with TOTAL_ASSETS
 *      → quarantine the cross-check line (not used in analytics)
 *
 * Everything is reversible: originalValue holds the pre-correction number and
 * correctionReason / validationNotes record exactly what changed and why.
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ACTOR = "audit-remediation-v1"
const QUARANTINE = "AUDIT_QUARANTINE:"
const NOTE = "AUDIT_CORRECTION:"

const CODES = ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "TOTAL_EQUITY_AND_LIABILITIES", "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "TOTAL_DEBT", "REVENUE", "COGS", "GROSS_PROFIT"]

function toDisplay(normalized, unit) {
  switch (unit) {
    case "BILLION": return normalized / 1e9
    case "MILLION": return normalized / 1e6
    case "THOUSAND": return normalized / 1e3
    default: return normalized
  }
}

const stats = {
  bsCorrected: 0, bsSkipped: 0,
  equityCorrected: 0,
  debtCorrected: 0, debtSkipped: 0,
  gpCorrected: 0, gpSkipped: 0,
  tealMismatches: 0,
  examples: [],
}

function near(a, b, tol) { return Math.abs(a - b) <= tol }

async function main() {
  console.log(`\n=== Deterministic remediation ${APPLY ? "APPLY" : "DRY RUN"} ===\n`)

  const reports = await db.financialReport.findMany({
    where: { deletedAt: null },
    select: {
      id: true, companyId: true, periodLabel: true, fiscalYear: true, periodType: true,
      company: { select: { ticker: true } },
      values: {
        where: { metricCode: { in: CODES }, validationStatus: "VALID" },
        select: { id: true, metricCode: true, normalizedValue: true, value: true, unit: true, subPeriod: true, originalValue: true, originalLabel: true },
      },
    },
  })

  for (const report of reports) {
    const bySub = new Map()
    for (const v of report.values) {
      const k = v.subPeriod ?? "CURRENT"
      if (!bySub.has(k)) bySub.set(k, new Map())
      bySub.get(k).set(v.metricCode, v)
    }

    for (const [sub, m] of bySub) {
      const A = m.get("TOTAL_ASSETS"), L = m.get("TOTAL_LIABILITIES"), E = m.get("TOTAL_EQUITY")
      const teal = m.get("TOTAL_EQUITY_AND_LIABILITIES")

      // ── D) cross-check line: reported for information only. We do NOT
      // quarantine it — a mismatch may indicate an error in assets/liabilities
      // rather than in the cross-check line. The audit surfaces it as a
      // diagnostic, and the data-quality page lists it for review.
      if (A && teal && !near(teal.normalizedValue, A.normalizedValue, Math.max(Math.abs(A.normalizedValue) * 0.01, 1_000_000))) {
        stats.tealMismatches++
        if (stats.examples.length < 12) stats.examples.push(`[TEAL] ${report.company.ticker} ${report.periodLabel} ${sub}: teal ${teal.normalizedValue} vs assets ${A.normalizedValue}`)
      }

      let equityFixed = false

      // ── A) mis-mapped total assets: components and L+E agree, assets does not
      if (A && L && E) {
        const CA = m.get("CURRENT_ASSETS"), NCA = m.get("NON_CURRENT_ASSETS")
        if (CA && NCA) {
          const compA = CA.normalizedValue + NCA.normalizedValue
          const le = L.normalizedValue + E.normalizedValue
          const base = Math.max(Math.abs(A.normalizedValue), Math.abs(compA), Math.abs(le))
          const th = Math.max(base * 0.005, Math.min(1_000_000, base * 0.001))
          const assetsOutlier = Math.abs(A.normalizedValue - compA) > th && Math.abs(A.normalizedValue - le) > th && Math.abs(compA - le) <= th && compA > 0
          if (assetsOutlier) {
            stats.bsCorrected++
            if (stats.examples.length < 12) stats.examples.push(`[ASSETS] ${report.company.ticker} ${report.periodLabel} ${sub}: A ${A.normalizedValue} → ${compA}`)
            if (APPLY) {
              await db.financialValue.update({
                where: { id: A.id },
                data: {
                  value: toDisplay(compA, A.unit),
                  normalizedValue: compA,
                  originalValue: A.originalValue ?? A.value,
                  isManuallyCorrected: true,
                  correctedBy: ACTOR,
                  correctedAt: new Date(),
                  correctionReason: "AUDIT_CORRECTION: TOTAL_ASSETS disagreed with both components (CA+NCA) and L+E; corrected to CA+NCA",
                  validationNotes: `${NOTE} total assets corrected from ${A.normalizedValue} to CA+NCA = ${compA}`,
                  validationStatus: "VALID",
                },
              })
            }
          }
        }
      }

      // ── A1) equity sign inversion (accumulated losses stored as positive).
      // A = L − |E| holds, while A = L + |E| does not, and treating L as the
      // mis-mapped line would require negative liabilities. Only then is the
      // equity line provably sign-inverted.
      if (A && L && E && E.normalizedValue > 0) {
        const base = Math.max(Math.abs(A.normalizedValue), Math.abs(L.normalizedValue), Math.abs(E.normalizedValue))
        const th = Math.max(base * 0.005, Math.min(1_000_000, base * 0.001))
        const gapPlus = Math.abs(A.normalizedValue - (L.normalizedValue + E.normalizedValue))
        const gapMinus = Math.abs(A.normalizedValue - (L.normalizedValue - E.normalizedValue))
        const liabilitiesIfEquityCorrect = A.normalizedValue - E.normalizedValue
        if (gapMinus <= th && gapPlus > th && liabilitiesIfEquityCorrect <= 0) {
          const corrected = -E.normalizedValue
          equityFixed = true
          stats.equityCorrected++
          if (stats.examples.length < 15) stats.examples.push(`[EQUITY] ${report.company.ticker} ${report.periodLabel} ${sub}: E ${E.normalizedValue} → ${corrected}`)
          if (APPLY) {
            await db.financialValue.update({
              where: { id: E.id },
              data: {
                value: toDisplay(corrected, E.unit),
                normalizedValue: corrected,
                originalValue: E.originalValue ?? E.value,
                isManuallyCorrected: true,
                correctedBy: ACTOR,
                correctedAt: new Date(),
                correctionReason: "AUDIT_CORRECTION: TOTAL_EQUITY sign inverted (accumulated losses); A = L − |E|, negative liabilities would otherwise be required",
                validationNotes: `${NOTE} equity sign corrected from ${E.normalizedValue} to ${corrected}`,
                validationStatus: "VALID",
              },
            })
          }
        }
      }

      // ── A2) mis-mapped total liabilities
      if (A && L && E && !equityFixed) {
        const base = Math.max(Math.abs(A.normalizedValue), Math.abs(L.normalizedValue), Math.abs(E.normalizedValue))
        const threshold = Math.max(base * 0.005, Math.min(1_000_000, base * 0.001))
        const gap = A.normalizedValue - (L.normalizedValue + E.normalizedValue)
        const tealMatchesAssets = teal ? near(teal.normalizedValue, A.normalizedValue, threshold) : false
        const lEqualsAssets = near(L.normalizedValue, A.normalizedValue, threshold)
        const lEqualsAssetsPlusEquity = near(L.normalizedValue, A.normalizedValue + E.normalizedValue, Math.max(base * 0.01, threshold))
        const lEqualsTeal = teal ? near(L.normalizedValue, teal.normalizedValue, threshold) : false
        const provable = Math.abs(gap) > threshold && (lEqualsAssets || lEqualsAssetsPlusEquity || (tealMatchesAssets && lEqualsTeal))
        const corrected = A.normalizedValue - E.normalizedValue
        if (provable && corrected > 0) {
          stats.bsCorrected++
          if (stats.examples.length < 12) stats.examples.push(`[BS] ${report.company.ticker} ${report.periodLabel} ${sub}: L ${L.normalizedValue} → ${corrected}`)
          if (APPLY) {
            await db.financialValue.update({
              where: { id: L.id },
              data: {
                value: toDisplay(corrected, L.unit),
                normalizedValue: corrected,
                originalValue: L.originalValue ?? L.value,
                isManuallyCorrected: true,
                correctedBy: ACTOR,
                correctedAt: new Date(),
                correctionReason: "AUDIT_CORRECTION: TOTAL_LIABILITIES was mapped to total assets / total equity & liabilities; corrected to TOTAL_ASSETS − TOTAL_EQUITY",
                validationNotes: `${NOTE} liabilities corrected from ${L.normalizedValue} to TOTAL_ASSETS − TOTAL_EQUITY = ${corrected}`,
                validationStatus: "VALID",
              },
            })
          }
        } else if (Math.abs(gap) > threshold) {
          stats.bsSkipped++
        }
      }

      // ── B) total debt lower than its components
      const ST = m.get("SHORT_TERM_DEBT"), LT = m.get("LONG_TERM_DEBT"), TD = m.get("TOTAL_DEBT")
      if (ST && LT && TD) {
        const components = ST.normalizedValue + LT.normalizedValue
        const looksNet = /net/i.test(TD.originalLabel || "")
        if (!looksNet && components > TD.normalizedValue * 1.02 && components > 0) {
          stats.debtCorrected++
          if (stats.examples.length < 12) stats.examples.push(`[DEBT] ${report.company.ticker} ${report.periodLabel} ${sub}: TD ${TD.normalizedValue} → ${components}`)
          if (APPLY) {
            await db.financialValue.update({
              where: { id: TD.id },
              data: {
                value: toDisplay(components, TD.unit),
                normalizedValue: components,
                originalValue: TD.originalValue ?? TD.value,
                isManuallyCorrected: true,
                correctedBy: ACTOR,
                correctedAt: new Date(),
                correctionReason: "AUDIT_CORRECTION: TOTAL_DEBT was lower than ST + LT; corrected to the sum of the components",
                validationNotes: `${NOTE} total debt corrected from ${TD.normalizedValue} to ST+LT = ${components}`,
                validationStatus: "VALID",
              },
            })
          }
        } else if (components > TD.normalizedValue * 1.02) {
          stats.debtSkipped++
        }
      }

      // ── C) gross-profit sign inversion
      const REV = m.get("REVENUE"), COGS = m.get("COGS"), GP = m.get("GROSS_PROFIT")
      if (REV && COGS && GP) {
        const expected = REV.normalizedValue - Math.abs(COGS.normalizedValue)
        const gbase = Math.max(Math.abs(REV.normalizedValue), Math.abs(COGS.normalizedValue), Math.abs(GP.normalizedValue))
        const inverted =
          Math.sign(expected) !== 0 && Math.sign(GP.normalizedValue) !== 0 &&
          Math.sign(expected) !== Math.sign(GP.normalizedValue) &&
          Math.abs(Math.abs(GP.normalizedValue) - Math.abs(expected)) <= Math.max(gbase * 0.001, 1_000_000) &&
          Math.abs(expected) / gbase >= 0.10
        if (inverted) {
          stats.gpCorrected++
          if (stats.examples.length < 12) stats.examples.push(`[GP] ${report.company.ticker} ${report.periodLabel} ${sub}: GP ${GP.normalizedValue} → ${expected}`)
          if (APPLY) {
            await db.financialValue.update({
              where: { id: GP.id },
              data: {
                value: toDisplay(expected, GP.unit),
                normalizedValue: expected,
                originalValue: GP.originalValue ?? GP.value,
                isManuallyCorrected: true,
                correctedBy: ACTOR,
                correctedAt: new Date(),
                correctionReason: "AUDIT_CORRECTION: GROSS_PROFIT had the opposite sign of REVENUE − |COGS|",
                validationNotes: `${NOTE} gross profit sign corrected from ${GP.normalizedValue} to ${expected}`,
                validationStatus: "VALID",
              },
            })
          }
        }
      }
    }
  }

  console.log(`BS lines corrected: ${stats.bsCorrected} | equity sign corrected: ${stats.equityCorrected} (ambiguous left for review: ${stats.bsSkipped})`)
  console.log(`TOTAL_DEBT corrected:     ${stats.debtCorrected} (net-debt/ambiguous skipped: ${stats.debtSkipped})`)
  console.log(`GROSS_PROFIT corrected:   ${stats.gpCorrected}`)
  console.log(`TEAL cross-check mismatches (advisory): ${stats.tealMismatches}`)
  console.log(`\nexamples:\n  ${stats.examples.join("\n  ") || "(none)"}`)
  console.log(APPLY ? "\nChanges written." : "\nDry run — re-run with --apply.")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
