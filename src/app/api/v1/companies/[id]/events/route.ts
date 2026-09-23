import { db } from "@/lib/db"
import { EVENT_TYPES } from "@/lib/financial/registry"

// GET /api/v1/companies/[id]/events — detected financial events with explanations
// generated from actual stored values.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const events = await db.financialEvent.findMany({
    where: { companyId: id },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }],
  })

  const toneByType = Object.fromEntries(EVENT_TYPES.map((e) => [e.type, e.tone]))
  const metaByType = Object.fromEntries(EVENT_TYPES.map((e) => [e.type, e]))

  return Response.json({
    events: events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      labelEn: metaByType[e.eventType]?.labelEn ?? e.eventType,
      labelAr: metaByType[e.eventType]?.labelAr ?? e.eventType,
      tone: toneByType[e.eventType] ?? "neutral",
      periodLabel: e.periodLabel,
      periodType: e.periodType,
      fiscalYear: e.fiscalYear,
      currentPeriodKey: e.currentPeriodKey,
      previousPeriodKey: e.previousPeriodKey,
      conditions: JSON.parse(e.conditions),
      explanationEn: e.explanationEn,
      explanationAr: e.explanationAr,
      ruleVersion: e.ruleVersion,
      detectedAt: e.detectedAt,
    })),
  })
}
