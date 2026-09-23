import { db } from "@/lib/db"
import { runScan } from "@/lib/financial/scan-service"
import { latestPeriodKeys } from "@/lib/financial/recompute"
import type { ScanCondition } from "@/lib/financial/scanner"

// GET /api/v1/companies/[id] — company profile + which preset scanners it matches
// (on both period bases) + latest period keys.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({
    where: { id },
    include: {
      _count: { select: { reports: true, events: true, dividends: true, values: true } },
    },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const presets = await db.scannerRule.findMany({ where: { isPreset: true, isActive: true } })
  const periods = await latestPeriodKeys(id)

  const matchedPresets: { presetKey: string; name: string; nameAr: string | null; basis: string }[] = []
  for (const basis of ["LATEST_ANNUAL", "LATEST_QUARTERLY"] as const) {
    for (const preset of presets) {
      const output = await runScan(JSON.parse(preset.conditions) as ScanCondition[], basis)
      const mine = output.matched.find((m) => m.companyId === id)
      if (mine) {
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
  })
}
