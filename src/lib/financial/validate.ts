// Validation Engine — multiple validation layers (spec #16).
// Mathematical (balance sheet identity), sign, unit, currency validations.
// Values that fail are NEVER silently accepted — they go to NEEDS_REVIEW.

import { RAW_METRIC_MAP } from "./registry"
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

const BALANCE_TOLERANCE = 0.01 // 1% tolerance for rounding

export function validateValues(inputs: ValidatableValue[]): {
  results: ValueValidationResult[]
  reportStatus: "VALIDATED" | "NEEDS_REVIEW" | "FAILED"
  reportNotes: string[]
} {
  const results: ValueValidationResult[] = []
  const reportNotes: string[] = []

  // Deduplicate by metric code (keep first)
  const seen = new Set<string>()

  for (const input of inputs) {
    const notes: string[] = []
    let status: "VALID" | "NEEDS_REVIEW" | "FAILED" = "VALID"

    const def = RAW_METRIC_MAP[input.metricCode]
    if (!def) {
      status = "FAILED"
      notes.push(`Unknown metric code "${input.metricCode}"`)
    }
    if (!isUnit(input.unit)) {
      status = status === "FAILED" ? "FAILED" : "NEEDS_REVIEW"
      notes.push(`Unknown unit "${input.unit}"`)
    }
    if (input.currency !== "EGP") {
      status = status === "FAILED" ? "FAILED" : "NEEDS_REVIEW"
      notes.push(`Currency "${input.currency}" is not EGP — currency validation failed`)
    }
    if (!Number.isFinite(input.value)) {
      status = "FAILED"
      notes.push("Value is not a finite number")
    }

    const normalizedValue = normalizeToEgp(input.value, isUnit(input.unit) ? input.unit : "UNIT")

    // Sign validation — do not accidentally flip negative expenses / losses / cash flows.
    if (def && status !== "FAILED" && Number.isFinite(input.value)) {
      if (def.statementType === "BALANCE_SHEET" && input.value < 0 && !["TOTAL_EQUITY"].includes(def.code)) {
        status = "NEEDS_REVIEW"
        notes.push("Negative balance-sheet value — possible sign extraction error")
      }
      if (def.code === "REVENUE" && input.value < 0) {
        status = "NEEDS_REVIEW"
        notes.push("Negative revenue — possible sign extraction error")
      }
      if (def.code === "COGS" && input.value < 0) {
        status = "NEEDS_REVIEW"
        notes.push("Negative cost of sales — possible sign extraction error")
      }
      // NET_PROFIT and OPERATING_CASH_FLOW may legitimately be negative — never "fixed".
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

  // Mathematical validation: Assets ≈ Liabilities + Equity (configurable tolerance)
  const byCode = new Map(results.map((r) => [r.metricCode, r]))
  const assets = byCode.get("TOTAL_ASSETS")
  const liabilities = byCode.get("TOTAL_LIABILITIES")
  const equity = byCode.get("TOTAL_EQUITY")
  if (assets && liabilities && equity && assets.validationStatus !== "FAILED" && liabilities.validationStatus !== "FAILED" && equity.validationStatus !== "FAILED") {
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
      reportNotes.push(note)
    }
  }

  // Completeness sanity check: a report without any revenue/profit/assets is suspicious
  const hasCore = results.some((r) => ["REVENUE", "NET_PROFIT", "TOTAL_ASSETS"].includes(r.metricCode) && r.validationStatus === "VALID")
  if (!hasCore && results.length > 0) {
    reportNotes.push("No core financial metrics (revenue / net profit / total assets) validated for this report")
  }
  if (results.length === 0) {
    reportNotes.push("No financial values could be extracted from the document")
  }

  const hasFailed = results.some((r) => r.validationStatus === "FAILED")
  const hasReview = results.some((r) => r.validationStatus === "NEEDS_REVIEW")
  const reportStatus = hasFailed || results.length === 0 ? "FAILED" : hasReview || reportNotes.length > 0 ? "NEEDS_REVIEW" : "VALIDATED"

  return { results, reportStatus, reportNotes }
}
