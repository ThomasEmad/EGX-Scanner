// Statement-type preference helpers (read-path shared logic).
//
// Companies may file BOTH consolidated and standalone statements. The database
// stores CalculatedMetric rows per statement type (unique [companyId, code,
// periodKey, statementType]). Read paths must NEVER mix the two sets for the
// same company: they fetch both types, then apply a PER-COMPANY preference —
// CONSOLIDATED when the company has any consolidated rows, otherwise STANDALONE.
//
// The preference functions at the top are PURE and dependency-free (no db import
// at module scope) so they can be unit-tested / sanity-run standalone. The db
// helpers (fetchCalc / fetchCalcMany / latestCalcPeriodKeys /
// availableReportStatementTypes) load the Prisma client lazily and are
// server-only.

import type { Prisma } from "@prisma/client"

export type StatementPref = "CONSOLIDATED" | "STANDALONE"

/** The two statement types a read path fetches for CalculatedMetric rows */
export const CALC_STATEMENT_TYPES = ["CONSOLIDATED", "STANDALONE"] as const

/**
 * Report processing statuses considered trustworthy on read paths.
 * Mirrors TRUSTED_STATUSES in recompute.ts (the calculation engine's own trust
 * boundary) so every read path exposes exactly the data the engine computed from.
 */
export const TRUSTED_REPORT_STATUSES = ["VALIDATED", "APPROVED", "EXTRACTED"] as const

/** Shape of a Prisma CalculatedMetric row (explicit for type stability) */
export interface CalcMetricRow {
  id: string
  companyId: string
  code: string
  periodKey: string
  periodType: string
  fiscalYear: number
  periodLabel: string
  value: number | null
  valueStatus: string
  statusDetail: string | null
  formulaVersion: string
  sourcePeriods: string
  statementType: string
  calculatedAt: Date
}

/**
 * Preference for one company's rows: CONSOLIDATED if any row is CONSOLIDATED,
 * else STANDALONE. (Empty input ⇒ STANDALONE — callers must handle emptiness.)
 */
export function statementPreference<T extends { statementType: string }>(rows: T[]): StatementPref {
  return rows.some((r) => r.statementType === "CONSOLIDATED") ? "CONSOLIDATED" : "STANDALONE"
}

/** Keep only rows whose statementType matches the preference */
export function filterByPreference<T extends { statementType: string }>(rows: T[], pref: StatementPref): T[] {
  return rows.filter((r) => r.statementType === pref)
}

/**
 * Per-company preference filter for arrays that span multiple companies:
 * keep a company's CONSOLIDATED rows when it has ANY consolidated row in the
 * array, otherwise keep its STANDALONE rows. Never mixes the two sets within
 * one company.
 */
export function preferConsolidatedRows<T extends { statementType: string; companyId: string }>(rows: T[]): T[] {
  const hasConsolidated = new Set<string>()
  for (const r of rows) if (r.statementType === "CONSOLIDATED") hasConsolidated.add(r.companyId)
  return rows.filter((r) => r.statementType === "CONSOLIDATED" || !hasConsolidated.has(r.companyId))
}

/** Deterministic display order for report statement types */
export function orderStatementTypes(types: string[]): string[] {
  const order = ["CONSOLIDATED", "STANDALONE", "UNKNOWN"]
  const seen = new Set(types)
  const ordered = order.filter((t) => seen.has(t))
  // any unexpected values keep their original relative order at the end
  return [...ordered, ...types.filter((t) => !order.includes(t))]
}

/** Default statement type when the caller does not request one:
 *  CONSOLIDATED if available, else STANDALONE, else whatever exists. */
export function defaultStatementType(available: string[]): string | null {
  if (available.includes("CONSOLIDATED")) return "CONSOLIDATED"
  if (available.includes("STANDALONE")) return "STANDALONE"
  return available[0] ?? null
}

// ---------------------------------------------------------------------------
// DB helpers (server-only; Prisma client loaded lazily so the pure functions
// above keep this module importable without a database).
// ---------------------------------------------------------------------------

/**
 * The ONE consistent fetch pattern for a single company's calculated metrics:
 * query BOTH statement types, compute the company's preference, filter.
 * Returns everything so callers can expose availability metadata.
 */
export async function fetchCalc(companyId: string, where: Prisma.CalculatedMetricWhereInput = {}): Promise<{
  rows: CalcMetricRow[]
  pref: StatementPref
  filtered: CalcMetricRow[]
}> {
  const { db } = await import("@/lib/db")
  const rows = (await db.calculatedMetric.findMany({
    where: { companyId, statementType: { in: [...CALC_STATEMENT_TYPES] }, ...where },
    orderBy: [{ code: "asc" }, { periodKey: "asc" }],
  })) as CalcMetricRow[]
  const pref = statementPreference(rows)
  const filtered = filterByPreference(rows, pref)
  return { rows, pref, filtered }
}

/**
 * Multi-company variant of fetchCalc (scanner / list endpoints):
 * one query for all requested companies, preference applied per company.
 */
export async function fetchCalcMany(
  companyIds: string[],
  where: Prisma.CalculatedMetricWhereInput = {}
): Promise<{
  rows: CalcMetricRow[]
  filtered: CalcMetricRow[]
  prefByCompany: Record<string, StatementPref>
  filteredByCompany: Record<string, CalcMetricRow[]>
}> {
  if (companyIds.length === 0) {
    return { rows: [], filtered: [], prefByCompany: {}, filteredByCompany: {} }
  }
  const { db } = await import("@/lib/db")
  const rows = (await db.calculatedMetric.findMany({
    where: { companyId: { in: companyIds }, statementType: { in: [...CALC_STATEMENT_TYPES] }, ...where },
    orderBy: [{ companyId: "asc" }, { code: "asc" }, { periodKey: "asc" }],
  })) as CalcMetricRow[]
  const filtered = preferConsolidatedRows(rows)
  const prefByCompany: Record<string, StatementPref> = {}
  const filteredByCompany: Record<string, CalcMetricRow[]> = {}
  for (const r of filtered) {
    filteredByCompany[r.companyId] ??= []
    filteredByCompany[r.companyId].push(r)
  }
  for (const [companyId, list] of Object.entries(filteredByCompany)) {
    prefByCompany[companyId] = statementPreference(list)
  }
  return { rows, filtered, prefByCompany, filteredByCompany }
}

/**
 * Latest annual / quarterly / TTM period keys for a company, derived from the
 * preferred statement-type set only (never mixed across types).
 */
export async function latestCalcPeriodKeys(
  companyId: string
): Promise<{ annual?: string; quarterly?: string; ttm?: string }> {
  const { parsePeriodKey } = await import("./periods")
  const { filtered } = await fetchCalc(companyId, { code: "revenue" })
  let annual: string | undefined
  let quarterly: string | undefined
  let ttm: string | undefined
  for (const m of filtered) {
    if (m.periodType === "ANNUAL" && (!annual || m.fiscalYear > parsePeriodKey(annual).fiscalYear)) annual = m.periodKey
    if (m.periodType === "QUARTERLY" && (!quarterly || m.fiscalYear > parsePeriodKey(quarterly).fiscalYear)) quarterly = m.periodKey
    if (m.periodType === "TTM" && (!ttm || m.fiscalYear > parsePeriodKey(ttm).fiscalYear)) ttm = m.periodKey
  }
  return { annual, quarterly, ttm }
}

/**
 * Statement types that actually have trusted reports for a company (used for
 * availableStatementTypes metadata on read endpoints).
 */
export async function availableReportStatementTypes(companyId: string): Promise<string[]> {
  const { db } = await import("@/lib/db")
  const rows = await db.financialReport.findMany({
    where: { companyId, processingStatus: { in: [...TRUSTED_REPORT_STATUSES] } },
    select: { statementType: true },
    distinct: ["statementType"],
  })
  return orderStatementTypes(rows.map((r) => r.statementType))
}
