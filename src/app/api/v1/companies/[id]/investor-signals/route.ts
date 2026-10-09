import { db } from "@/lib/db"
import { buildInvestorSignals } from "@/lib/financial/analysis/investor-signals"
import type { AnalysisContext, PeriodSnapshot } from "@/lib/financial/analysis/types"
import { getLatestPrice } from "@/lib/financial/market"
import { reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/companies/[id]/investor-signals — structured investor signals
// across 5 dimensions (Growth / Profitability / Balance Sheet / Cash / Earnings).
//
// Spec section 20: Each signal is grounded in validated facts + period keys.
// Signals are FLAGS for investigation — not conclusions.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const reports = await db.financialReport.findMany({
    where: {
      companyId: id,
      processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] },
      deletedAt: null,
    },
    include: { values: true },
    orderBy: { fiscalYear: "asc" },
  })
  if (reports.length === 0) {
    return Response.json({
      companyId: id,
      companyName: company.nameEn,
      ticker: company.ticker,
      sector: company.sector,
      generatedAt: new Date().toISOString(),
      error: "NO_DATA",
      message: "No validated financial reports available for this company.",
      signals: [],
      byDimension: { GROWTH: [], PROFITABILITY: [], BALANCE_SHEET: [], CASH: [], EARNINGS: [] },
      summary: { growth: 0, profitability: 0, balanceSheet: 0, cash: 0, earnings: 0, total: 0, flags: 0, improvements: 0, deteriorations: 0 },
    }, { status: 200 })
  }

  const byPeriodKey = new Map<string, PeriodSnapshot>()
  for (const r of reports) {
    const pk = reportPeriodKey(r)
    const snap: PeriodSnapshot = {
      periodKey: pk,
      periodType: r.periodType,
      fiscalYear: r.fiscalYear,
      periodLabel: r.periodLabel,
      values: {},
    }
    for (const v of r.values) {
      if (snap.values[v.metricCode] === undefined) {
        snap.values[v.metricCode] = v.normalizedValue
      }
    }
    byPeriodKey.set(pk, snap)
  }
  const periods = [...byPeriodKey.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

  const pricePoint = await getLatestPrice(id)
  const ctx: AnalysisContext = {
    companyId: id,
    companyTicker: company.ticker,
    companyName: company.nameEn,
    sector: company.sector,
    periods,
    anchorPeriodKey: periods[periods.length - 1]?.periodKey,
    marketPrice: pricePoint?.price,
    hasDividendRecords: false,
  }

  const result = buildInvestorSignals(ctx)
  // Strip duplicates that the API adds at top level (result also contains these)
  const { companyId: _cid, generatedAt: _gat, ...rest } = result
  return Response.json({
    companyId: id,
    companyName: company.nameEn,
    ticker: company.ticker,
    sector: company.sector,
    generatedAt: new Date().toISOString(),
    ...rest,
  })
}
