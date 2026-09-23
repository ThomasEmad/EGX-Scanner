import { db } from "@/lib/db"
import { buildScanContexts } from "@/lib/financial/scan-service"
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

  const [presets, periods, price] = await Promise.all([
    db.scannerRule.findMany({ where: { isPreset: true, isActive: true } }),
    latestCalcPeriodKeys(id),
    getLatestPrice(id),
  ])

  const matchedPresets: { presetKey: string; name: string; nameAr: string | null; basis: string }[] = []
  for (const basis of ["LATEST_ANNUAL", "LATEST_QUARTERLY", "LATEST_TTM"] as const) {
    const contexts = await buildScanContexts(basis)
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
