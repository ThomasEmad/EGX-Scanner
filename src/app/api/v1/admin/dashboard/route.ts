import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"

// GET /api/v1/admin/dashboard — admin-only dashboard stats.
// Returns internal counts that should not be exposed to regular users.

export async function GET(req: Request) {
  if (!(await isAdmin(req))) {
    return await unauthorizedResponse()
  }

  const [
    pendingReview,
    pendingReports,
    companies,
    activeCompanies,
    reportsByStatus,
    valuesByStatus,
    metricsByStatus,
    events,
    lastRun,
    recentLog,
  ] = await Promise.all([
    db.financialValue.count({ where: { validationStatus: "NEEDS_REVIEW" } }),
    db.financialReport.count({ where: { deletedAt: null, processingStatus: { in: ["NEW_DOWNLOADED", "NEEDS_REVIEW"] } } }),
    db.company.count(),
    db.company.count({ where: { isActive: true } }),
    db.financialReport.groupBy({ by: ["processingStatus"], _count: { _all: true }, where: { deletedAt: null } }),
    db.financialValue.groupBy({ by: ["validationStatus"], _count: { _all: true } }),
    db.calculatedMetric.groupBy({ by: ["valueStatus"], _count: { _all: true } }),
    db.financialEvent.count(),
    db.auditRun.findFirst({ orderBy: { startedAt: "desc" }, select: { startedAt: true, endedAt: true, durationSec: true, companiesChecked: true, issuesFound: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 12, select: { id: true, actor: true, action: true, entityType: true, entityId: true, details: true, createdAt: true } }),
  ])

  return Response.json({
    stats: {
      pendingReview,
      pendingReports,
      companies,
      activeCompanies,
      events,
      reportsByStatus: Object.fromEntries(reportsByStatus.map((r) => [r.processingStatus, r._count._all])),
      valuesByStatus: Object.fromEntries(valuesByStatus.map((r) => [r.validationStatus, r._count._all])),
      metricsByStatus: Object.fromEntries(metricsByStatus.map((r) => [r.valueStatus, r._count._all])),
      lastAuditRun: lastRun,
      recentLog,
    },
  })
}
