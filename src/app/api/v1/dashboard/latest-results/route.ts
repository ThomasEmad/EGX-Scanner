import { db } from "@/lib/db"

// GET /api/v1/dashboard/latest-results — the freshest announced results across
// the market: the most recent trusted NET_PROFIT per company, newest first.
// Serves the investor's primary goal: "what's the latest data available now?"

const TRUSTED = ["VALIDATED", "APPROVED", "EXTRACTED"]

export async function GET() {
  const rows = await db.financialValue.findMany({
    where: {
      metricCode: "NET_PROFIT",
      validationStatus: "VALID",
      report: { processingStatus: { in: TRUSTED } },
    },
    orderBy: [{ report: { periodEnd: "desc" } }],
    take: 220,
    select: {
      normalizedValue: true,
      companyId: true,
      report: {
        select: {
          periodLabel: true,
          periodType: true,
          fiscalYear: true,
          periodEnd: true,
          sourceName: true,
        },
      },
      company: { select: { ticker: true, nameAr: true, nameEn: true } },
    },
  })

  // dedupe: first (newest) row per company
  const seen = new Set<string>()
  const out: {
    companyId: string; ticker: string; name: string; nameEn: string
    periodLabel: string; periodType: string; fiscalYear: number
    asOf: Date; source: string; netProfit: number
  }[] = []
  for (const v of rows) {
    if (seen.has(v.companyId)) continue
    seen.add(v.companyId)
    out.push({
      companyId: v.companyId,
      ticker: v.company.ticker,
      name: v.company.nameAr || v.company.nameEn,
      nameEn: v.company.nameEn,
      periodLabel: v.report.periodLabel,
      periodType: v.report.periodType,
      fiscalYear: v.report.fiscalYear,
      asOf: v.report.periodEnd,
      source: v.report.sourceName,
      netProfit: v.normalizedValue,
    })
    if (out.length >= 12) break
  }

  return Response.json({ results: out })
}
