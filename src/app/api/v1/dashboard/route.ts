import { db } from "@/lib/db"
import { runScan } from "@/lib/financial/scan-service"
import type { ScanCondition } from "@/lib/financial/scanner"

// GET /api/v1/dashboard — discovery-first dashboard (spec #43/#44):
// preset scanner counts, recent events, dividend calendar, portfolio stats.

export async function GET() {
  const presets = await db.scannerRule.findMany({ where: { isPreset: true, isActive: true }, orderBy: { createdAt: "asc" } })

  const scannerCards = await Promise.all(
    presets.map(async (rule) => {
      const output = await runScan(JSON.parse(rule.conditions) as ScanCondition[], "LATEST_ANNUAL")
      return {
        id: rule.id,
        presetKey: rule.presetKey,
        name: rule.name,
        nameAr: rule.nameAr,
        description: rule.description,
        count: output.matched.length,
        topMatches: output.matched.slice(0, 4).map((m) => ({
          companyId: m.companyId,
          ticker: m.ticker,
          nameEn: m.nameEn,
          nameAr: m.nameAr,
          period: m.contextPeriodLabel,
        })),
      }
    })
  )

  const [companyCount, reportCount, valueCount, eventCount, upcomingDividends, recentEvents] = await Promise.all([
    db.company.count({ where: { isActive: true } }),
    db.financialReport.count(),
    db.financialValue.count({ where: { validationStatus: "VALID" } }),
    db.financialEvent.count(),
    db.dividend.findMany({
      where: { status: { in: ["ANNOUNCED", "UPCOMING", "ELIGIBLE"] } },
      include: { company: { select: { ticker: true, nameEn: true, nameAr: true } } },
      orderBy: { announcementDate: "asc" },
      take: 6,
    }),
    db.financialEvent.findMany({
      include: { company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, isDemoData: true } } },
      orderBy: [{ detectedAt: "desc" }],
      take: 8,
    }),
  ])

  const pendingReview = await db.financialValue.count({ where: { validationStatus: "NEEDS_REVIEW" } })
  const pendingReports = await db.financialReport.count({ where: { processingStatus: { in: ["NEW_DOWNLOADED", "NEEDS_REVIEW"] } } })

  return Response.json({
    stats: {
      companies: companyCount,
      reports: reportCount,
      validValues: valueCount,
      events: eventCount,
      pendingReview,
      pendingReports,
    },
    scannerCards,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      periodLabel: e.periodLabel,
      explanationEn: e.explanationEn,
      explanationAr: e.explanationAr,
      company: e.company,
    })),
    upcomingDividends: upcomingDividends.map((d) => ({
      id: d.id,
      status: d.status,
      announcementDate: d.announcementDate,
      eligibilityDate: d.eligibilityDate,
      exDividendDate: d.exDividendDate,
      distributionDate: d.distributionDate,
      dividendPerShare: d.dividendPerShare,
      notes: d.notes,
      company: d.company,
    })),
  })
}
