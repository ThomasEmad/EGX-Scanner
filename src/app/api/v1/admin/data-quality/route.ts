import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-auth"

// GET /api/v1/admin/data-quality — latest audit run summary + issues + confidence
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return Response.json({ error: "ADMIN_AUTH_REQUIRED" }, { status: 401 })

  const run = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  if (!run) return Response.json({ error: "NO_RUN" }, { status: 404 })

  const [bySeverity, byCategory, topIssues, confidences] = await Promise.all([
    db.auditIssue.groupBy({ by: ["severity"], where: { auditRunId: run.id }, _count: true }),
    db.auditIssue.groupBy({ by: ["category"], where: { auditRunId: run.id }, _count: true }),
    db.auditIssue.findMany({
      where: { auditRunId: run.id, severity: { in: ["critical", "high"] }, status: "open" },
      orderBy: [{ severity: "asc" }, { ticker: "asc" }],
      take: 100,
    }),
    db.companyConfidenceScore.findMany({ where: { auditRunId: run.id }, orderBy: { score: "asc" } }),
  ])

  const worst = confidences.slice(0, 15)
  const distribution = { high: 0, medium: 0, low: 0, critical: 0 }
  for (const cf of confidences) distribution[cf.rating] = (distribution[cf.rating] ?? 0) + 1

  return Response.json({
    run: { id: run.id, startedAt: run.startedAt, endedAt: run.endedAt, durationSec: run.durationSec, companiesChecked: run.companiesChecked, issuesFound: run.issuesFound },
    bySeverity: Object.fromEntries(bySeverity.map((g) => [g.severity, g._count])),
    byCategory: Object.fromEntries(byCategory.map((g) => [g.category, g._count])),
    distribution,
    worst,
    topIssues,
  })
}
