import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { RAW_METRIC_MAP } from "@/lib/financial/registry"
import {
  CALC_STATEMENT_TYPES,
  TRUSTED_REPORT_STATUSES,
  availableReportStatementTypes,
  availableReportPeriodViews,
  defaultStatementType,
  defaultPeriodView,
  validatePeriodView,
  freshestPeriodView,
  withinYearRank,
  PERIOD_VIEW_TYPES,
  type PeriodView,
} from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/financials — source financial values grouped by
// statement kind and period. Values keep a bilingual display label + unit
// (spec #25) — the source-document traceability itself stays internal.
//
// Statement-type aware (spec #23): consolidated vs standalone filings are kept
// separate and NEVER mixed. `?statementType=CONSOLIDATED|STANDALONE` selects one
// basis; when absent the default is CONSOLIDATED if the company has trusted
// consolidated reports, else STANDALONE, else whatever exists. Only trusted
// reports (VALIDATED / APPROVED / EXTRACTED — the calculation engine's trust
// boundary) contribute periods/statements.
//
// Period-view separation: `?period_view=annual|interim` selects ANNUAL filings
// only or interim filings (QUARTERLY/SEMIANNUAL/NINE_MONTH) only — the two are
// NEVER mixed in one response (mixing FY columns with 9M/H1/Q columns makes the
// statements unreadable for investors). Default: annual when available, else
// interim. `availablePeriodViews` tells the UI which toggles to offer.

// Internal maintenance markers must never reach the public UI (product rule:
// no data provenance / tooling notes for end users). If a source label carries
// one — derivation formulas, copy notes, source refs — fall back to the
// canonical registry label for the metric. Admin-only views keep the raw
// labels; this guard is for this public endpoint only.
const INTERNAL_MARKER = /^(COPIED from|DERIVED )|\(source:|AUDIT_QUARANTINE|ASKBORA|MEDIAN|IMPUTED|CARRY[- ]?FORWARD/i

function userFacingLabel(code: string, label: string): string {
  if (!label || !INTERNAL_MARKER.test(label)) return label
  return RAW_METRIC_MAP[code]?.labelEn ?? code.replaceAll("_", " ")
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const raw = decodeURIComponent(id)
  // CUIDs are lower-case and case-sensitive; only upper-case ticker/ISIN keys.
  const upper = raw.toUpperCase()
  const company = await db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
    select: { id: true },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  const companyId = company.id

  const url = new URL(req.url)
  const availableStatementTypes = await availableReportStatementTypes(companyId)
  const requestedBasis = url.searchParams.get("statementType")
  if (requestedBasis && !(CALC_STATEMENT_TYPES as readonly string[]).includes(requestedBasis)) {
    return Response.json(
      { error: "VALIDATION", message: "statementType must be CONSOLIDATED or STANDALONE" },
      { status: 400 }
    )
  }
  const statementType = requestedBasis ?? defaultStatementType(availableStatementTypes)

  const availablePeriodViews = await availableReportPeriodViews(companyId, statementType ?? undefined)
  const requestedView = validatePeriodView(url.searchParams.get("period_view"))
  if (requestedView === null) {
    return Response.json(
      { error: "VALIDATION", message: "period_view must be annual or interim" },
      { status: 400 }
    )
  }
    const latestEnds = await db.financialReport.groupBy({
    by: ["periodType"],
    where: {
      companyId,
      processingStatus: { in: [...TRUSTED_REPORT_STATUSES] },
      periodType: { in: ["ANNUAL", "QUARTERLY", "SEMIANNUAL", "NINE_MONTH"] },
    },
    _max: { periodEnd: true },
  })
  const latestAnnualEnd = latestEnds.find((g) => g.periodType === "ANNUAL")?._max.periodEnd ?? null
  const latestInterimEnd = latestEnds
    .filter((g) => g.periodType !== "ANNUAL")
    .map((g) => g._max.periodEnd)
    .filter((d): d is Date => !!d)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null
  const periodView: PeriodView | null = requestedView ?? freshestPeriodView(availablePeriodViews, latestAnnualEnd, latestInterimEnd)

  // an explicitly requested type that has no trusted reports simply yields empty structures
  const values = statementType && periodView
    ? await db.financialValue.findMany({
        where: {
          companyId,
          validationStatus: "VALID",
          report: {
            processingStatus: { in: [...TRUSTED_REPORT_STATUSES] },
            statementType,
            periodType: { in: PERIOD_VIEW_TYPES[periodView] },
          },
        },
        include: {
          report: {
            select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, processingStatus: true },
          },
        },
        orderBy: [{ reportId: "asc" }],
      })
    : []

  // period columns sorted chronologically (fiscal year, then within-year sequence)
  const periodMap = new Map<string, { key: string; label: string; periodType: string; fiscalYear: number; rank: number }>()
  for (const v of values) {
    const key = `${v.report.periodType}:${v.report.fiscalYear}:${subOf(v.report.periodLabel, v.report.periodType)}`
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        key,
        label: v.report.periodLabel,
        periodType: v.report.periodType,
        fiscalYear: v.report.fiscalYear,
        rank: withinYearRank(v.report.periodType, v.report.periodLabel),
      })
    }
  }
  const periods = [...periodMap.values()]
    .sort((a, b) => a.fiscalYear - b.fiscalYear || a.rank - b.rank)
    .map(({ rank: _rank, ...p }) => p)

  const rowsMap = new Map<string, {
    code: string
    statementType: string
    cells: Record<string, {
      value: number; unit: string; normalizedValue: number; label: string
      flags?: { yoyPct?: number; badSign?: boolean; zero?: boolean }
    }>
  }>()
  for (const v of values) {
    const key = `${v.report.periodType}:${v.report.fiscalYear}:${subOf(v.report.periodLabel, v.report.periodType)}`
    if (!rowsMap.has(v.metricCode)) {
      rowsMap.set(v.metricCode, { code: v.metricCode, statementType: v.statementType, cells: {} })
    }
    rowsMap.get(v.metricCode)!.cells[key] = {
      value: v.value,
      unit: v.unit,
      normalizedValue: v.normalizedValue,
      label: userFacingLabel(v.metricCode, v.originalLabel),
    }
  }

  // ---- investor anomaly flags (deterministic, read-time) --------------------
  // 1. YoY jump: |current − previous| / |previous| > 50% vs the same period one
  //    fiscal year earlier (never cross-period: Q1 vs Q1, FY vs FY).
  // 2. badSign: total assets / revenue must never be negative.
  // 3. zero: revenue of exactly zero means missing data wearing a zero mask.
  // Pipeline validation state (e.g. which source report failed which internal
  // check) is deliberately NOT exposed here — it is internal operations data.
  let flaggedCells = 0
  for (const row of rowsMap.values()) {
    for (const [key, cell] of Object.entries(row.cells)) {
      const flags: NonNullable<(typeof cell)["flags"]> = {}
      const [periodType, yearStr, sub] = key.split(":")
      const prevKey = `${periodType}:${Number(yearStr) - 1}:${sub}`
      const prev = row.cells[prevKey]
      if (prev && prev.normalizedValue !== 0) {
        const change = Math.abs(cell.normalizedValue - prev.normalizedValue) / Math.abs(prev.normalizedValue)
        if (change > 0.5) flags.yoyPct = change * 100
      }
      if (cell.normalizedValue < 0 && (row.code === "TOTAL_ASSETS" || row.code === "REVENUE")) flags.badSign = true
      if (cell.normalizedValue === 0 && row.code === "REVENUE") flags.zero = true
      if (Object.keys(flags).length > 0) {
        cell.flags = flags
        flaggedCells++
      }
    }
  }

  const rows = [...rowsMap.values()]

  return Response.json({
    statementType,
    availableStatementTypes,
    periodView,
    availablePeriodViews,
    periods,
    anomalyCount: flaggedCells,
    statements: {
      INCOME_STATEMENT: rows.filter((r) => r.statementType === "INCOME_STATEMENT"),
      BALANCE_SHEET: rows.filter((r) => r.statementType === "BALANCE_SHEET"),
      CASH_FLOW: rows.filter((r) => r.statementType === "CASH_FLOW"),
      OTHER: rows.filter((r) => r.statementType === "OTHER"),
    },
  })
}

function subOf(label: string, periodType: string): string {
  const up = label.toUpperCase()
  if (periodType === "QUARTERLY") return up.match(/Q([1-4])/)?.[0] ?? ""
  if (periodType === "SEMIANNUAL") return up.match(/H([1-2])/)?.[0] ?? ""
  return ""
}
