// Unit normalization engine.
// Values may be printed as EGP thousand / million / billion. Raw values are NEVER
// compared before normalizing units. All normalized values are stored in plain EGP.

export const UNITS = ["UNIT", "THOUSAND", "MILLION", "BILLION"] as const
export type Unit = (typeof UNITS)[number]

export const UNIT_FACTORS: Record<Unit, number> = {
  UNIT: 1,
  THOUSAND: 1e3,
  MILLION: 1e6,
  BILLION: 1e9,
}

export function isUnit(u: string): u is Unit {
  return (UNITS as readonly string[]).includes(u)
}

/** Convert a value + unit into plain EGP (normalized value) */
export function normalizeToEgp(value: number, unit: string): number {
  const factor = isUnit(unit) ? UNIT_FACTORS[unit] : 1
  return value * factor
}

/** Choose the friendliest display unit for an EGP amount */
export function bestDisplayUnit(absValue: number): Unit {
  const abs = Math.abs(absValue)
  if (abs >= 1e9) return "BILLION"
  if (abs >= 1e6) return "MILLION"
  if (abs >= 1e3) return "THOUSAND"
  return "UNIT"
}

/** Format an EGP amount with the best unit, e.g. "EGP 12.4B" */
export function formatEgp(value: number | null | undefined, opts?: { withCurrency?: boolean; decimals?: number }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const withCurrency = opts?.withCurrency ?? true
  const unit = bestDisplayUnit(value)
  const scaled = value / UNIT_FACTORS[unit]
  const decimals = opts?.decimals ?? (Math.abs(scaled) >= 100 ? 0 : Math.abs(scaled) >= 10 ? 1 : 2)
  const suffix = unit === "UNIT" ? "" : unit === "THOUSAND" ? "K" : unit === "MILLION" ? "M" : "B"
  const text = `${scaled.toFixed(decimals)}${suffix}`
  return withCurrency ? `EGP ${text}` : text
}

/** Format a percent value, e.g. "+21.4%" */
export function formatPercent(value: number | null | undefined, opts?: { decimals?: number; sign?: boolean }): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  const decimals = opts?.decimals ?? 1
  const sign = opts?.sign ? (value > 0 ? "+" : "") : ""
  return `${sign}${value.toFixed(decimals)}%`
}

/** Format ratio, e.g. "1.8x" */
export function formatRatio(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—"
  return `${value.toFixed(decimals)}x`
}
