import { NextRequest } from "next/server"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { db } from "@/lib/db"

// GET /api/v1/admin/audit/[id] — one run's full detail: counters, issues
// (filterable by severity/category/ticker, paginated), confidence table.

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await ctx.params

  const run = await db.auditRun.findUnique({ where: { id } })
  if (!run) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const url = new URL(req.url)
  const severity = url.searchParams.get("severity") ?? undefined
  const category = url.searchParams.get("category") ?? undefined
  const ticker = url.searchParams.get("ticker")?.toUpperCase()
  const status = url.searchParams.get("status") ?? undefined
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1)
  const pageSize = Math.min(200, Math.max(10, Number(url.searchParams.get("pageSize") ?? "50") || 50))

  const where = {
    auditRunId: id,
    ...(severity ? { severity } : {}),
    ...(category ? { category } : {}),
    ...(ticker ? { ticker } : {}),
    ...(status ? { status } : {}),
  }

  const [issues, total, bySeverity, byCategory, confidences] = await Promise.all([
    db.auditIssue.findMany({
      where,
      orderBy: [{ severity: "asc" }, { ticker: "asc" }, { category: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.auditIssue.count({ where }),
    db.auditIssue.groupBy({ by: ["severity"], where: { auditRunId: id }, _count: true }),
    db.auditIssue.groupBy({ by: ["category"], where: { auditRunId: id }, _count: true }),
    db.companyConfidenceScore.findMany({
      where: { auditRunId: id },
      orderBy: { score: "asc" },
      select: { ticker: true, score: true, rating: true, breakdownJson: true },
    }),
  ])

  return Response.json({
    run,
    bySeverity: Object.fromEntries(bySeverity.map((g) => [g.severity, g._count])),
    byCategory: Object.fromEntries(byCategory.map((g) => [g.category, g._count])),
    issues,
    pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    confidences,
  })
}
