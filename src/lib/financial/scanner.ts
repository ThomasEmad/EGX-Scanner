// Scanner Engine — a configurable rule engine. Scanners require no hard-coded
// frontend logic: rules are stored (JSON conditions) and every result carries a
// per-condition explanation generated from actual stored values.
// A scanner result is a factual financial statement — never an investment recommendation.

import { CALC_METRIC_MAP, CALC_METRICS, EVENT_TYPE_MAP, RAW_METRIC_MAP } from "./registry"
import { formatEgp, formatPercent, formatRatio } from "./units"
import type { MetricResult } from "./calc"

export type ScanCondition =
  | { kind: "metric"; code: string; operator: Operator; value: number }
  | { kind: "event"; eventType: string }
  | { kind: "dividend"; statuses: string[] }

export type Operator = ">" | ">=" | "<" | "<=" | "==" | "!="

export interface ScanContext {
  /** calculated metrics for the evaluated period, keyed by code */
  metrics: Record<string, MetricResult>
  /** event types detected in the evaluated period */
  events: Set<string>
  /** dividend statuses present for the company (e.g. ANNOUNCED, UPCOMING, PAID...) */
  dividendStatuses: string[]
}

export interface ConditionEval {
  kind: "metric" | "event" | "dividend"
  code?: string
  eventType?: string
  statuses?: string[]
  operator?: Operator
  threshold?: number
  labelEn: string
  labelAr: string
  /** actual value / finding, formatted for display */
  actualDisplay: string
  actualRaw?: number
  status: "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"
  note?: string
  matched: boolean
}

export interface RuleEval {
  matched: boolean
  matchedCount: number
  conditions: ConditionEval[]
}

const OPERATORS: Record<Operator, (a: number, b: number) => boolean> = {
  ">": (a, b) => a > b,
  ">=": (a, b) => a >= b,
  "<": (a, b) => a < b,
  "<=": (a, b) => a <= b,
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
}

export function isOperator(op: string): op is Operator {
  return [">", ">=", "<", "<=", "==", "!="].includes(op)
}

function opSymbol(op: Operator): string {
  return op === ">=" ? "≥" : op === "<=" ? "≤" : op
}

function formatMetricValue(code: string, value: number): string {
  const def = CALC_METRIC_MAP[code]
  if (!def) return String(value)
  switch (def.unit) {
    case "PERCENT":
      return formatPercent(value)
    case "EGP":
      return formatEgp(value)
    case "EGP_PER_SHARE":
      return `EGP ${value.toFixed(2)}`
    case "RATIO":
      return formatRatio(value)
    default:
      return String(value)
  }
}

export function evaluateCondition(condition: ScanCondition, ctx: ScanContext): ConditionEval {
  if (condition.kind === "metric") {
    const def = CALC_METRIC_MAP[condition.code]
    const result = ctx.metrics[condition.code]
    const labelEn = def?.labelEn ?? condition.code
    const labelAr = def?.labelAr ?? condition.code
    if (!result || result.status !== "OK" || result.value === undefined) {
      return {
        kind: "metric",
        code: condition.code,
        operator: condition.operator,
        threshold: condition.value,
        labelEn,
        labelAr,
        actualDisplay: "—",
        status: result?.status ?? "DATA_UNAVAILABLE",
        note: result?.detail ?? `Metric "${condition.code}" is not available for this company/period — NOT treated as zero`,
        matched: false,
      }
    }
    const matched = OPERATORS[condition.operator](result.value, condition.value)
    return {
      kind: "metric",
      code: condition.code,
      operator: condition.operator,
      threshold: condition.value,
      labelEn,
      labelAr,
      actualDisplay: formatMetricValue(condition.code, result.value),
      actualRaw: result.value,
      status: "OK",
      matched,
    }
  }

  if (condition.kind === "event") {
    const def = EVENT_TYPE_MAP[condition.eventType]
    const matched = ctx.events.has(condition.eventType)
    return {
      kind: "event",
      eventType: condition.eventType,
      labelEn: def?.labelEn ?? condition.eventType,
      labelAr: def?.labelAr ?? condition.eventType,
      actualDisplay: matched ? "Detected ✓" : "Not detected",
      status: "OK",
      matched,
    }
  }

  // dividend
  const matched = condition.statuses.some((s) => ctx.dividendStatuses.includes(s))
  return {
    kind: "dividend",
    statuses: condition.statuses,
    labelEn: `Dividend status in (${condition.statuses.join(", ")})`,
    labelAr: `حالة التوزيعات (${condition.statuses.join("، ")})`,
    actualDisplay: ctx.dividendStatuses.length ? ctx.dividendStatuses.join(", ") : "None",
    status: "OK",
    matched,
  }
}

/** Evaluate a full rule — ALL conditions must match (AND logic). */
export function evaluateRule(conditions: ScanCondition[], ctx: ScanContext): RuleEval {
  const evals = conditions.map((c) => evaluateCondition(c, ctx))
  const matchedCount = evals.filter((e) => e.matched).length
  return { matched: evals.length > 0 && matchedCount === evals.length, matchedCount, conditions: evals }
}

/** Validate a rule definition (backend must validate requested metrics exist) */
export function validateRuleConditions(conditions: ScanCondition[]): { valid: boolean; errors: string[] } {
  const errors: string[] = []
  if (!Array.isArray(conditions) || conditions.length === 0) {
    errors.push("Rule must contain at least one condition")
  }
  for (const c of conditions) {
    if (c.kind === "metric") {
      const def = CALC_METRIC_MAP[c.code]
      if (!def) errors.push(`Unknown metric code "${c.code}"`)
      if (!isOperator(c.operator)) errors.push(`Invalid operator "${c.operator}"`)
      if (typeof c.value !== "number" || Number.isNaN(c.value)) errors.push(`Invalid threshold for metric "${c.code}"`)
      if (def?.kind === "market") {
        errors.push(`Metric "${c.code}" is market-dependent and market data is not connected — it will always be DATA_UNAVAILABLE`)
      }
    } else if (c.kind === "event") {
      if (!EVENT_TYPE_MAP[c.eventType]) errors.push(`Unknown event type "${c.eventType}"`)
    } else if (c.kind === "dividend") {
      const allowed = ["ANNOUNCED", "UPCOMING", "ELIGIBLE", "PAID", "EXPIRED", "CANCELLED"]
      if (!Array.isArray(c.statuses) || c.statuses.length === 0 || c.statuses.some((s) => !allowed.includes(s))) {
        errors.push(`Invalid dividend statuses — allowed: ${allowed.join(", ")}`)
      }
    } else {
      errors.push("Unknown condition kind")
    }
  }
  return { valid: errors.length === 0, errors }
}

/** Which scan-able metrics exist (for the custom scanner builder) */
export function scannableMetricCodes(): string[] {
  return CALC_METRICS.filter((m) => m.kind !== "market").map((m) => m.code)
}

/** Metric availability check for a rule vs a set of contexts (do not silently ignore unavailable conditions) */
export function ruleAvailability(conditions: ScanCondition[], contexts: ScanContext[]): Record<string, number> {
  const availability: Record<string, number> = {}
  for (const c of conditions) {
    if (c.kind === "metric") {
      availability[c.code] = contexts.filter((ctx) => {
        const r = ctx.metrics[c.code]
        return r && r.status === "OK" && r.value !== undefined
      }).length
    }
  }
  return availability
}

// keep registry imports referenced for consumers
export { CALC_METRICS, RAW_METRIC_MAP }
