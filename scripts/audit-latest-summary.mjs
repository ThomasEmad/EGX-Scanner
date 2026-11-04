// Prints the latest AuditRun summary + severity/category distributions.
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
try {
  const r = await db.auditRun.findFirst({ orderBy: { startedAt: "desc" } })
  if (!r) {
    console.log("no audit runs found")
  } else {
    console.log("run id:", r.id, "| started:", r.startedAt.toISOString(), "| ended:", r.endedAt ? r.endedAt.toISOString() : null)
    console.log("status:", r.status, "| companies checked:", r.companiesChecked, "| issues found:", r.issuesFound, "| auto-fixed:", r.issuesFixed, "| duration:", r.durationSec + "s")
    const g = await db.auditIssue.groupBy({ by: ["severity"], where: { auditRunId: r.id }, _count: { _all: true } })
    console.log("severity distribution:")
    for (const s of g.sort((a, b) => b._count._all - a._count._all)) console.log("  ", s.severity + ":", s._count._all)
    const cats = await db.auditIssue.groupBy({ by: ["category"], where: { auditRunId: r.id }, _count: { _all: true } })
    console.log("category distribution:")
    for (const c of cats.sort((a, b) => b._count._all - a._count._all)) console.log("  ", c.category + ":", c._count._all)
    // any stale issues referencing removed growth/current_ratio codes?
    const stale = await db.auditIssue.count({
      where: {
        auditRunId: r.id,
        metricCode: { in: ["revenue_growth", "profit_growth", "ocf_growth", "debt_growth", "equity_growth", "eps_growth", "asset_growth", "current_ratio"] },
      },
    })
    console.log("issues referencing removed growth/current_ratio metrics:", stale)
    const scores = await db.companyConfidenceScore.count({ where: { auditRunId: r.id } })
    console.log("confidence scores computed:", scores)
  }
} finally {
  await db.$disconnect()
}
