import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { EVENT_TYPE_MAP } from "@/lib/financial/registry"

// GET /api/v1/events?companyIds=id1,id2&limit=15 — latest detected financial events
// with company info. Used by the watchlist alerts digest (filter to watched
// companies) and available as a general recent-events feed.

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const companyIdsParam = searchParams.get("companyIds")
  const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 15) || 15, 1), 50)
  const eventType = searchParams.get("eventType")

  const companyIds = (companyIdsParam ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 100)

  const events = await db.financialEvent.findMany({
    where: {
      ...(companyIds.length ? { companyId: { in: companyIds } } : {}),
      ...(eventType && EVENT_TYPE_MAP[eventType] ? { eventType } : {}),
    },
    orderBy: { detectedAt: "desc" },
    take: limit,
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, isDemoData: true } },
    },
  })

  return Response.json({
    events: events.map((e) => {
      const meta = EVENT_TYPE_MAP[e.eventType]
      return {
        id: e.id,
        eventType: e.eventType,
        labelEn: meta?.labelEn ?? e.eventType,
        labelAr: meta?.labelAr ?? e.eventType,
        tone: meta?.tone ?? "neutral",
        periodLabel: e.periodLabel,
        periodType: e.periodType,
        fiscalYear: e.fiscalYear,
        currentPeriodKey: e.currentPeriodKey,
        previousPeriodKey: e.previousPeriodKey,
        explanationEn: e.explanationEn,
        explanationAr: e.explanationAr,
        ruleVersion: e.ruleVersion,
        detectedAt: e.detectedAt.toISOString(),
        company: e.company,
      }
    }),
  })
}
