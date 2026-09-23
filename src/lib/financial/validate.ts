// Validation Engine — multiple validation layers (spec #16).
// Mathematical (balance sheet identity, PBT − tax = net profit), sign, unit, currency,
// completeness checks. Values that fail are NEVER silently altered — they go to NEEDS_REVIEW.
// Every check is also emitted as a structured result row for FinancialValidationResult.

import { RAW_METRIC_MAP, isUnitlessMetric } from "./registry"
import { isUnit, normalizeToEgp } from "./units"

export interface ValidatableValue {
  metricCode: string
  originalLabel: string
  value: number
  unit: string
  currency: string
  sourcePage?: number | null
  confidence?: number
}

export interface ValueValidationResult {
  input: ValidatableValue
  metricCode: string
  normalizedValue: number
  statementType: string
  validationStatus: "VALID" | "NEEDS_REVIEW" | "FAILED"
  validationNotes: string[]
}

export interface StructuredCheck {
  checkName: string
  category: "MATH" | "SIGN" | "UNIT" | "CURRENCY" | "COMPLETENESS" | "PERIOD"
  status: "PASSED" | "WARNING" | "FAILED" | "SKIPPED"
  severity: "INFO" | "WARNING" | "CRITICAL"
  details: string
}

const BALANCE_TOLERANCE = 0.01 // 1% tolerance for rounding
const PBT_TAX_TOLERANCE = 0.015

export function validateValues(inputs: ValidatableValue[]): {
  results: ValueValidationResult[]
  reportStatus: "VALIDATED" | "NEEDS_REVIEW" | "FAILED"
  reportNotes: string[]
  checks: StructuredCheck[]
} {
  const results: ValueValidationResult[] = []
  const reportNotes: string[] = []
  const checks: StructuredCheck[] = []
  const addNote = (checkName: string, category: StructuredCheck["category"], status: StructuredCheck["status"], severity: StructuredCheck["severity"], details: string) => {
    checks.push({ checkName, category, status, severity, details })
    if (status !== "PASSED" && status !== "SKIPPED") reportNotes.push(details)
  }

  // Deduplicate by metric code (keep first)
  const seen = new Set<string>()
  const duplicates = new Set<string>()

  for (const input of inputs) {
    const notes: string[] = []
    let status: "VALID" | "NEEDS_REVIEW" | "FAILED" = "VALID"

    const def = RAW_METRIC_MAP[input.metricCode]
    if (!def) {
      status = "FAILED"
      notes.push(`Unknown metric code "${input.metricCode}"`)
      addNote("METRIC_REGISTRY", "UNIT", "FAILED", "CRITICAL", `Unknown metric code "${input.metricCode}"`)
    }
    if (seen.has(input.metricCode) && status !== "FAILED") {
      duplicates.add(input.metricCode)
      notes.push(`Duplicate figure for ${input.metricCode} — first occurrence kept, later occurrence ignored`)
      continue
    }
    seen.add(input.metricCode)

    const unitless = isUnitlessMetric(input.metricCode)
    if (!unitless && !isUnit(input.unit)) {
      status = status === "FAILED" ? "FAILED" : "NEEDS_REVIEW"
      notes.push(`Unknown unit "${input.unit}"`)
      addNote("UNIT_CHECK", "UNIT", "FAILED", "WARNING", `Unknown unit "${input.unit}" for ${input.metricCode}`)
    }
    if (input.currency !== "EGP") {
      status = status === "FAILED" ? "FAILED" : "NEEDS_REVIEW"
      notes.push(`Currency "${input.currency}" is not EGP — currency validation failed`)
      addNote("CURRENCY_CHECK", "CURRENCY", "FAILED", "CRITICAL", `Currency "${input.currency}" is not EGP for ${input.metricCode}`)
    }
    if (!Number.isFinite(input.value)) {
      status = "FAILED"
      notes.push("Value is not a finite number")
      addNote("VALUE_FINITE", "MATH", "FAILED", "CRITICAL", `${input.metricCode}: value is not a finite number`)
    }

    // Per-share (EPS/DPS/BVPS) and share-count values are never unit-scaled
    const normalizedValue = unitless || !isUnit(input.unit)
      ? input.value
      : normalizeToEgp(input.value, input.unit)

    // Sign validation — do not accidentally flip negative expenses / losses / cash flows.
    // Presentation convention (spec #8): "(1,250,000)" is extracted as -1,250,000.
    // Expense lines (COGS, tax, finance cost) and cash outflows are routinely
    // printed in parentheses — that is the source's deduction notation, NOT a
    // sign error. Only genuinely impossible negatives are flagged.
    if (def && status !== "FAILED" && Number.isFinite(input.value)) {
      const LEGIT_NEGATIVE_BALANCE = ["TOTAL_EQUITY", "EQUITY_PARENT", "RETAINED_EARNINGS", "NON_CONTROLLING_INTERESTS"]
      if (def.statementType === "BALANCE_SHEET" && input.value < 0 && !LEGIT_NEGATIVE_BALANCE.includes(def.code)) {
        status = "NEEDS_REVIEW"
        notes.push("Negative balance-sheet value — possible sign extraction error")
        addNote("SIGN_CHECK", "SIGN", "WARNING", "WARNING", `${def.code} is negative (${input.value}) — possible sign extraction error`)
      }
      if (def.code === "REVENUE" && input.value < 0) {
        status = "NEEDS_REVIEW"
        notes.push("Negative revenue — possible sign extraction error")
        addNote("SIGN_CHECK", "SIGN", "WARNING", "WARNING", "Negative revenue — possible sign extraction error")
      }
      if (def.code === "COGS" && input.value < 0) {
        // Deduction presentation — valid, recorded as INFO for traceability.
        notes.push("Cost of sales printed as deduction (negative) — source sign convention preserved")
        addNote("SIGN_CHECK", "SIGN", "PASSED", "INFO", "COGS negative (parenthesized deduction in source) — convention preserved, not altered")
      }
      // NET_PROFIT / INCOME_TAX / FINANCE_COST / cash flows may legitimately be
      // negative — never "fixed".
    }

    results.push({
      input,
      metricCode: input.metricCode,
      normalizedValue,
      statementType: def?.statementType ?? "OTHER",
      validationStatus: status,
      validationNotes: notes,
    })
  }

  if (duplicates.size > 0) {
    addNote("DUPLICATE_FIGURE", "COMPLETENESS", "WARNING", "INFO",
      `Duplicate figures detected for: ${[...duplicates].join(", ")} — first occurrence kept`)
  } else {
    addNote("DUPLICATE_FIGURE", "COMPLETENESS", "PASSED", "INFO", "No duplicated metric figures")
  }

  // ---- Mathematical validation ----
  const byCode = new Map(results.filter((r) => r.validationStatus !== "FAILED").map((r) => [r.metricCode, r]))
  const assets = byCode.get("TOTAL_ASSETS")
  const liabilities = byCode.get("TOTAL_LIABILITIES")
  const equity = byCode.get("TOTAL_EQUITY")
  const equityAndLiab = byCode.get("TOTAL_EQUITY_AND_LIABILITIES")

  let balanceDone = false
  if (assets && liabilities && equity) {
    const sum = liabilities.normalizedValue + equity.normalizedValue
    const diff = Math.abs(assets.normalizedValue - sum)
    const rel = assets.normalizedValue !== 0 ? diff / Math.abs(assets.normalizedValue) : diff
    if (rel > BALANCE_TOLERANCE) {
      const note = `Balance sheet identity failed: Assets (${assets.normalizedValue.toExponential(3)}) ≉ Liabilities + Equity (${sum.toExponential(3)}), relative difference ${(rel * 100).toFixed(2)}% > ${(BALANCE_TOLERANCE * 100).toFixed(0)}% tolerance`
      for (const r of [assets, liabilities, equity]) {
        if (r.validationStatus === "VALID") {
          r.validationStatus = "NEEDS_REVIEW"
          r.validationNotes.push(note)
        }
      }
      addNote("BALANCE_SHEET_IDENTITY", "MATH", "FAILED", "CRITICAL", note)
    } else {
      addNote("BALANCE_SHEET_IDENTITY", "MATH", "PASSED", "INFO",
        `Assets = Liabilities + Equity within ${(rel * 100).toFixed(3)}% (tolerance ${(BALANCE_TOLERANCE * 100).toFixed(0)}%)`)
    }
    balanceDone = true
  }
  if (!balanceDone && assets && equityAndLiab) {
    const diff = Math.abs(assets.normalizedValue - equityAndLiab.normalizedValue)
    const rel = assets.normalizedValue !== 0 ? diff / Math.abs(assets.normalizedValue) : diff
    if (rel > BALANCE_TOLERANCE) {
      const note = `Cross-check failed: Assets (${assets.normalizedValue.toExponential(3)}) ≉ Total Equity and Liabilities (${equityAndLiab.normalizedValue.toExponential(3)}), relative difference ${(rel * 100).toFixed(2)}%`
      for (const r of [assets, equityAndLiab]) {
        if (r.validationStatus === "VALID") {
          r.validationStatus = "NEEDS_REVIEW"
          r.validationNotes.push(note)
        }
      }
      addNote("BALANCE_SHEET_IDENTITY", "MATH", "FAILED", "CRITICAL", note)
    } else {
      addNote("BALANCE_SHEET_IDENTITY", "MATH", "PASSED", "INFO",
        `Assets = Total Equity and Liabilities within ${(rel * 100).toFixed(3)}%`)
    }
    balanceDone = true
  }
  if (!balanceDone) {
    addNote("BALANCE_SHEET_IDENTITY", "MATH", "SKIPPED", "INFO",
      "Balance identity not checked — one or more of Total Assets / Total Liabilities / Total Equity missing")
  }

  // PBT − Tax ≈ Net Profit (income statement consistency)
  const pbt = byCode.get("PROFIT_BEFORE_TAX")
  const tax = byCode.get("INCOME_TAX")
  const ni = byCode.get("NET_PROFIT")
  if (pbt && tax && ni) {
    // Tax expense is always a DEDUCTION from PBT regardless of how the source
    // prints it (positive or in parentheses). Use its magnitude — the stored
    // sign reflects presentation, not direction.
    const expected = pbt.normalizedValue - Math.abs(tax.normalizedValue)
    const diff = Math.abs(expected - ni.normalizedValue)
    const rel = expected !== 0 ? diff / Math.abs(expected) : diff
    if (rel > PBT_TAX_TOLERANCE) {
      const note = `Income statement consistency: PBT − |Tax| (${expected.toExponential(3)}) ≉ Net Profit (${ni.normalizedValue.toExponential(3)}), relative difference ${(rel * 100).toFixed(2)}%`
      for (const r of [pbt, tax, ni]) {
        if (r.validationStatus === "VALID") {
          r.validationStatus = "NEEDS_REVIEW"
          r.validationNotes.push(note)
        }
      }
      addNote("PBT_TAX_NET_PROFIT", "MATH", "FAILED", "CRITICAL", note)
    } else {
      addNote("PBT_TAX_NET_PROFIT", "MATH", "PASSED", "INFO",
        `PBT − Tax = Net Profit within ${(rel * 100).toFixed(3)}%`)
    }
  } else {
    addNote("PBT_TAX_NET_PROFIT", "MATH", "SKIPPED", "INFO",
      "PBT/Tax/Net Profit consistency not checked — required lines missing")
  }

  // Gross profit consistency: Revenue − |Cost of Sales| ≈ Gross Profit (WARNING only —
  // "cost of sales" definitions vary between companies, so never block on it)
  const revenue = byCode.get("REVENUE")
  const cogs = byCode.get("COGS")
  const gross = byCode.get("GROSS_PROFIT")
  if (revenue && cogs && gross) {
    const expected = revenue.normalizedValue - Math.abs(cogs.normalizedValue)
    const rel = revenue.normalizedValue !== 0 ? Math.abs(expected - gross.normalizedValue) / Math.abs(revenue.normalizedValue) : 0
    if (rel > BALANCE_TOLERANCE * 2) {
      addNote("GROSS_PROFIT_CONSISTENCY", "MATH", "WARNING", "WARNING",
        `Revenue − |Cost of Sales| (${expected.toExponential(3)}) ≉ Gross Profit (${gross.normalizedValue.toExponential(3)}), relative difference ${(rel * 100).toFixed(2)}% — cost definitions may differ`)
    } else {
      addNote("GROSS_PROFIT_CONSISTENCY", "MATH", "PASSED", "INFO", "Revenue − Cost of Sales consistent with Gross Profit")
    }
  }

  // Sub-debt sanity: short-term + long-term debt ≈ total debt when all present
  const st = byCode.get("SHORT_TERM_DEBT")
  const lt = byCode.get("LONG_TERM_DEBT")
  const td = byCode.get("TOTAL_DEBT")
  if (td && st && lt) {
    const sum = st.normalizedValue + lt.normalizedValue
    const rel = td.normalizedValue !== 0 ? Math.abs(sum - td.normalizedValue) / Math.abs(td.normalizedValue) : 0
    if (rel > BALANCE_TOLERANCE * 2) {
      addNote("DEBT_COMPONENTS", "MATH", "WARNING", "WARNING",
        `Short-term (${st.normalizedValue.toExponential(3)}) + Long-term (${lt.normalizedValue.toExponential(3)}) ≉ Total Debt (${td.normalizedValue.toExponential(3)}), relative difference ${(rel * 100).toFixed(2)}%`)
    } else {
      addNote("DEBT_COMPONENTS", "MATH", "PASSED", "INFO", "Short-term + Long-term debt consistent with Total Debt")
    }
  }

  // Completeness sanity check: a report without any revenue/profit/assets is suspicious
  const hasCore = results.some((r) => ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS"].includes(r.metricCode) && r.validationStatus === "VALID")
  if (!hasCore && results.length > 0) {
    addNote("COMPLETENESS", "COMPLETENESS", "WARNING", "WARNING",
      "No core financial metrics (revenue / net profit / total assets) validated for this report")
  } else if (results.length > 0) {
    addNote("COMPLETENESS", "COMPLETENESS", "PASSED", "INFO", "Core financial metrics present")
  }
  if (results.length === 0) {
    addNote("COMPLETENESS", "COMPLETENESS", "FAILED", "CRITICAL", "No financial values could be extracted from the document")
  }

  const hasFailed = results.some((r) => r.validationStatus === "FAILED")
  const hasReview = results.some((r) => r.validationStatus === "NEEDS_REVIEW")
  const criticalCheck = checks.some((c) => c.severity === "CRITICAL" && (c.status === "FAILED" || c.status === "WARNING"))
  const reportStatus = hasFailed || results.length === 0 ? "FAILED" : hasReview || criticalCheck ? "NEEDS_REVIEW" : "VALIDATED"

  return { results, reportStatus, reportNotes, checks }
}
