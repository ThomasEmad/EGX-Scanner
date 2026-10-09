import { db } from "@/lib/db"
import { buildResearchProfile } from "@/lib/financial/analysis/research-profile"
import { answerResearchQuestions } from "@/lib/financial/analysis/research-questions"
import type { AnalysisContext, PeriodSnapshot } from "@/lib/financial/analysis/types"
import { getLatestPrice } from "@/lib/financial/market"
import { reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/companies/[id]/research-profile — full research profile:
// runs every analysis module (14 categories + sector overlay) and the 16
// pre-built research-question answers.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  // Load all approved/validated reports and their values
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
      profile: null,
      researchQuestions: [],
    }, { status: 200 })
  }

  // Build period snapshots (one per period key)
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
      // Use normalizedValue (plain EGP)
      if (snap.values[v.metricCode] === undefined) {
        snap.values[v.metricCode] = v.normalizedValue
      }
    }
    byPeriodKey.set(pk, snap)
  }
  const periods = [...byPeriodKey.values()].sort((a, b) => a.periodKey.localeCompare(b.periodKey))

  // Get latest price (for market metrics — may be null)
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

  const profile = buildResearchProfile(ctx)
  const researchQuestions = answerResearchQuestions(ctx)

  return Response.json({
    companyId: id,
    companyName: company.nameEn,
    ticker: company.ticker,
    sector: company.sector,
    generatedAt: new Date().toISOString(),
    profile,
    researchQuestions,
    periodCount: periods.length,
    latestPeriodKey: ctx.anchorPeriodKey,
  })
}
