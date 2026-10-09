import { db } from "@/lib/db"
import { cached } from "@/lib/server-cache"
import { buildScanContextsCached } from "@/lib/financial/scan-service"
import { latestCalcPeriodKeys } from "@/lib/financial/statement-pref"
import { getLatestPrice } from "@/lib/financial/market"
import { evaluateRule, type ScanCondition } from "@/lib/financial/scanner"

// GET /api/v1/companies/[id] — company profile + which preset scanners it matches
// (on all period bases) + latest period keys + latest market price point.
// Preset matching builds the scan context ONCE per basis and evaluates every rule
// against it (cheap) instead of running a full scan per rule (42 full scans).
// latestPeriods comes from the company's preferred statement-type set
// (CONSOLIDATED when available, else STANDALONE — never mixed).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({
    where: { id },
    include: {
      _count: { select: { reports: true, events: true, dividends: true, values: true } },
    },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const [presets, periods, price, latestReport] = await Promise.all([
    db.scannerRule.findMany({ where: { isPreset: true, isActive: true } }),
    latestCalcPeriodKeys(id),
    getLatestPrice(id),
    // freshness: latest period-end across trusted filings (data-as-of display)
    db.financialReport.findFirst({
      where: { companyId: id, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
      orderBy: { periodEnd: "desc" },
      select: { periodEnd: true, periodLabel: true },
    }),
  ])

  const matchedPresets: { presetKey: string; name: string; nameAr: string | null; basis: string }[] = []
  // the three bases are independent — build/scan them in parallel (each
  // buildScanContexts scans every company, so serial ×3 dominated this route)
  // buildScanContexts scans EVERY company — ~1.4s per basis per request. The
  // result is market-wide and only changes on recompute, so cache per basis.
  const contextsByBasis = await Promise.all(
    (["LATEST_ANNUAL", "LATEST_QUARTERLY", "LATEST_TTM"] as const).map((basis) =>
      buildScanContextsCached(basis).then((contexts) => ({ basis, contexts }))
    )
  )
  for (const { basis, contexts } of contextsByBasis) {
    const mine = contexts.find((c) => c.company.id === id)
    if (!mine) continue
    for (const preset of presets) {
      const evaluation = evaluateRule(JSON.parse(preset.conditions) as ScanCondition[], mine.context)
      if (evaluation.matched) {
        matchedPresets.push({
          presetKey: preset.presetKey ?? preset.name,
          name: preset.name,
          nameAr: preset.nameAr,
          basis,
        })
      }
    }
  }

  return Response.json({
    company: {
      id: company.id,
      ticker: company.ticker,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      sector: company.sector,
      industry: company.industry,
      listingStatus: company.listingStatus,
      isDemoData: company.isDemoData,
      sharesOutstanding: company.sharesOutstanding,
      descriptionEn: company.descriptionEn,
      descriptionAr: company.descriptionAr,
      counts: company._count,
    },
    latestPeriods: periods,
    dataAsOf: latestReport
      ? { periodEnd: latestReport.periodEnd.toISOString(), periodLabel: latestReport.periodLabel }
      : null,
    matchedPresets,
    marketPrice: price
      ? {
          price: price.price,
          asOf: price.asOf.toISOString(),
          currency: price.currency,
          sourceName: price.sourceName,
          isDemoData: price.isDemoData,
        }
      : null,
  })
}
