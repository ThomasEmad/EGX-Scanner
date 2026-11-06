import { db } from "@/lib/db"
import { readMarketSnapshot } from "@/lib/market/snapshot"
import { cachedResponse } from "@/lib/public-cache"

// GET /api/v1/status — public, machine-readable platform status: what the
// site serves, how fresh the data is, and whether everything is healthy.
// Backs the /status trust page. 60s cache (cheap counts, no secrets).

export async function GET() {
  return cachedResponse("platform-status", 60 * 1000, async () => {
    const [companies, activeCompanies, reports, prices, latestPrice, latestReport, alerts, analyses] =
      await Promise.all([
        db.company.count(),
        db.company.count({ where: { isActive: true } }),
        db.financialReport.count(),
        db.marketPrice.count(),
        db.marketPrice.findFirst({ orderBy: { asOf: "desc" }, select: { asOf: true } }),
        db.financialReport.findFirst({ orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        db.priceAlert.count({ where: { active: true } }),
        db.aiAnalysis.count(),
      ])

    const snapshot = readMarketSnapshot()

    return {
      status: "ok",
      time: new Date().toISOString(),
      market: {
        pricesAsOf: snapshot?.pricesAsOf ?? latestPrice?.asOf.toISOString() ?? null,
        delayMinutes: snapshot?.delayMinutes ?? null,
        trackedPrices: snapshot?.movers.length ?? null,
      },
      data: {
        companiesTotal: companies,
        companiesActive: activeCompanies,
        financialReports: reports,
        marketPricePoints: prices,
        aiAnalyses: analyses,
        latestReportImportedAt: latestReport?.createdAt.toISOString() ?? null,
      },
      usage: { activePriceAlerts: alerts },
    }
  })
}
