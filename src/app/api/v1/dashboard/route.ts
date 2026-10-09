import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getPresetScannerCards } from "@/lib/financial/scan-service"
import type { ScanCondition } from "@/lib/financial/scanner"
import { getOptionalUser } from "@/lib/optional-auth"
import { cached } from "@/lib/server-cache"

// GET /api/v1/dashboard — discovery-first dashboard (spec #43/#44):
// preset scanner counts, recent events, dividend calendar, portfolio stats.
// Public endpoints only; admin-only stats are served from /api/v1/admin/dashboard.
// Company Events (recentEvents) are premium-only.

export async function GET(req: NextRequest) {
  const { isPremium } = await getOptionalUser(req)

  const scannerCards = await getPresetScannerCards()

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
    isPremium
      ? db.financialEvent.findMany({
          include: { company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, isDemoData: true } } },
          orderBy: [{ detectedAt: "desc" }],
          take: 8,
        })
      : Promise.resolve([]),
  ])

  return Response.json({
    stats: {
      companies: companyCount,
      reports: reportCount,
      validValues: valueCount,
      events: eventCount,
    },
    scannerCards,
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      eventType: e.eventType,
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
