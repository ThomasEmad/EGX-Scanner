import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { findCompanyByKey } from "@/lib/company-lookup"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"
import {
  CALC_STATEMENT_TYPES,
  PERIOD_VIEW_TYPES,
  fetchCalc,
  filterByPreference,
  validatePeriodView,
  freshestPeriodView,
  TRUSTED_REPORT_STATUSES,
  defaultPeriodView,
  availableReportPeriodViews,
  withinYearRank,
  type StatementPref,
  type PeriodView,
} from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/metrics — calculated metrics matrix across periods
// (with value status). Cell provenance/formula metadata is intentionally NOT
// exposed to the public API — it is internal engine documentation. The engine's
// per-cell `statusDetail` (coherence-guard reasons like "period-end collision",
// "annual copy", "YTD stored as discrete quarter") is pipeline validation
// language — the public API only forwards the neutral "X not available for this
// period" phrasing; every other detail is dropped and the UI falls back to a
// generic "not available" note.
//
// Statement-type aware: CalculatedMetric rows exist per statement type
// (CONSOLIDATED | STANDALONE) and are NEVER mixed. Default is the company's
// preference (CONSOLIDATED when it has any consolidated rows, else STANDALONE);
// `?statementType=CONSOLIDATED|STANDALONE` overrides explicitly.
//
// Period-view separation: `?period_view=annual|interim` filters ANNUAL rows or
// interim rows (QUARTERLY/SEMIANNUAL/NINE_MONTH) — never both in one response.
// TTM/OTHER rows are excluded from both views (synthetic/undefined comparability).
// Default: annual when available, else interim. `availablePeriodViews` tells the
// UI which toggles to offer.
//
// `[id]` accepts company id, ticker or ISIN (see findCompanyByKey).

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await findCompanyByKey(id)
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  const companyId = company.id

  const { rows, pref } = await fetchCalc(companyId)
  // CONSOLIDATED before STANDALONE when both exist
  const availableStatementTypes = [...new Set(rows.map((r) => r.statementType))].sort((a, b) => a.localeCompare(b))

  const url = new URL(req.url)
  const requested = url.searchParams.get("statementType")
  if (requested && !(CALC_STATEMENT_TYPES as readonly string[]).includes(requested)) {
    return Response.json(
      { error: "VALIDATION", message: "statementType must be CONSOLIDATED or STANDALONE" },
      { status: 400 }
    )
  }
  const statementType = requested ?? pref
  const active = requested ? filterByPreference(rows, requested as StatementPref) : rows.filter((r) => r.statementType === statementType)

  const availablePeriodViews = await availableReportPeriodViews(companyId, statementType)
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
  const allowedTypes = periodView ? new Set(PERIOD_VIEW_TYPES[periodView]) : null

  const periodMap = new Map<string, { key: string; label: string; periodType: string; fiscalYear: number; rank: number }>()
  const rowsMap = new Map<string, { code: string; cells: Record<string, { value: number | null; status: string; detail: string | null }> }>()

  // Public-facing detail whitelist: the engine's own "not available" phrasing
  // is safe for investors; coherence-guard/validation prose is internal only.
  const NEUTRAL_DETAIL = /^[A-Z][A-Z_]* not available for this period$/
  const publicDetail = (detail: string | null): string | null => (detail && NEUTRAL_DETAIL.test(detail) ? detail : null)

  for (const m of active) {
    if (allowedTypes && !allowedTypes.has(m.periodType)) continue
    if (!periodMap.has(m.periodKey)) {
      periodMap.set(m.periodKey, {
        key: m.periodKey,
        label: m.periodLabel,
        periodType: m.periodType,
        fiscalYear: m.fiscalYear,
        rank: withinYearRank(m.periodType, m.periodLabel),
      })
    }
    if (!rowsMap.has(m.code)) rowsMap.set(m.code, { code: m.code, cells: {} })
    rowsMap.get(m.code)!.cells[m.periodKey] = {
      value: m.value,
      status: m.valueStatus,
      detail: publicDetail(m.statusDetail),
    }
  }

  const periods = [...periodMap.values()]
    .sort((a, b) => a.fiscalYear - b.fiscalYear || a.rank - b.rank)
    .map(({ rank: _rank, ...p }) => p)
  const metricRows = [...rowsMap.values()].map((r) => ({
    ...r,
    labelEn: CALC_METRIC_MAP[r.code]?.labelEn ?? r.code,
    labelAr: CALC_METRIC_MAP[r.code]?.labelAr ?? r.code,
    unit: CALC_METRIC_MAP[r.code]?.unit ?? "RATIO",
    kind: CALC_METRIC_MAP[r.code]?.kind ?? "passthrough",
  }))

  return Response.json({ statementType, availableStatementTypes, periodView, availablePeriodViews, periods, rows: metricRows })
}
