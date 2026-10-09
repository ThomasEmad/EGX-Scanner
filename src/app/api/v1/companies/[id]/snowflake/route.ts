import { NextRequest } from "next/server"
import { gatherCompanyAnalytics } from "@/lib/analytics/gather"
import { computeSnowflake, dimensionAnalysis } from "@/lib/analytics/engine"
import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/snowflake — 10-axis sector-percentile snowflake
// + per-dimension framed analysis (spec §2.3-2.6). Direction table per §2.3.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gatherCompanyAnalytics(id)
  if (!g) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const latestWithMarket: Record<string, number | null> = { ...g.latest, PRICE_RETURN_1Y: g.priceReturn1Y }
  const sectorMaps = g.peers.map((p) => p.latest)
  // market cap / dividend yield already in latest via CalculatedMetric; peers too
  const axes = computeSnowflake(latestWithMarket, sectorMaps)

  const dimNames: Record<string, { en: string; ar: string }> = {
    value: { en: "Valuation", ar: "القيمة" },
    quality: { en: "Quality", ar: "الجودة" },
    growth: { en: "Growth", ar: "النمو" },
    health: { en: "Health", ar: "الصحة" },
    dividend: { en: "Dividend", ar: "التوزيعات" },
    profitability: { en: "Profitability", ar: "الربحية" },
    efficiency: { en: "Efficiency", ar: "الكفاءة" },
    momentum: { en: "Momentum", ar: "الزخم" },
    size: { en: "Size", ar: "الحجم" },
  }
  const analysis = axes.map((a) => {
    const d = dimensionAnalysis(
      dimNames[a.axis] ? (dimNames[a.axis][lang0(a.axis)] ?? dimNames[a.axis].en) : a.axis,
      a.value, a.sectorMedian, a.percentile, "en",
    )
    return { axis: a.axis, axisAr: dimNames[a.axis]?.ar ?? a.axis, value: a.value, sectorMedian: a.sectorMedian, percentile: a.percentile, analysis: d }
  })

  return Response.json({
    ticker: g.ticker,
    latestYear: g.latestYear,
    axes,
    analysis,
    peerCount: g.peers.length,
  })
}

function lang0(_axis: string) { return "en" }
