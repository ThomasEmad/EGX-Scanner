import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { classifyStoredIssue, ROOT_CAUSE_LABELS, type RootCause } from "@/lib/audit/issue-class"

// GET /api/v1/companies/[id]/confidence — ADMIN-ONLY data-confidence badge data.
// Data-quality scores, provenance dimensions and audit blockers are internal
// operations data — never shown to end users (the public badge was removed).
// `[id]` accepts ticker, ISIN or company id.

interface Breakdown {
  accuracy?: number
  completeness?: number
  freshness?: number
  provenance?: number
  certification?: string
  blockerCount?: number
  coverageGapCount?: number
}

function parseBreakdown(json: string | null | undefined): Breakdown {
  if (!json) return {}
  try { return JSON.parse(json) as Breakdown } catch { return {} }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Internal audit data — never exposed to end users.
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const { id } = await params
  const raw = decodeURIComponent(id)
  // CUIDs are lower-case and case-sensitive; only upper-case the ticker/ISIN
  // lookup keys. Upper-casing the id made /companies/<cuid>/confidence 404.
  const upper = raw.toUpperCase()

  const company = await db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
    select: { id: true, ticker: true, nameEn: true, nameAr: true },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const run = await db.auditRun.findFirst({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  })

  const confidence = run
    ? await db.companyConfidenceScore.findUnique({
        where: { ticker: company.ticker },
        select: { score: true, rating: true, breakdownJson: true, computedAt: true },
      })
    : null

  const rawIssues = run
    ? await db.auditIssue.findMany({
        where: { auditRunId: run.id, ticker: company.ticker, status: "open" },
        orderBy: { severity: "asc" },
        take: 40,
        select: { severity: true, category: true, description: true, descriptionAr: true, period: true, metricCode: true },
      })
    : []

  const issues = rawIssues
    .map((i) => {
      const c = classifyStoredIssue(i)
      return {
        ...i,
        issueClass: c.issueClass,
        rootCause: c.rootCause,
        rootCauseLabel: ROOT_CAUSE_LABELS[c.rootCause as RootCause] ?? null,
      }
    })
    .filter((i) => i.issueClass === "blocker")
    .slice(0, 5)

  if (!confidence && !issues.length) {
    return Response.json({ error: "NO_AUDIT_DATA" }, { status: 404 })
  }

  const b = parseBreakdown(confidence?.breakdownJson)
  const certification = b.certification ?? (issues.length ? "review_required" : "provisional")

  return Response.json({
    ticker: company.ticker,
    nameEn: company.nameEn,
    nameAr: company.nameAr,
    auditedAt: run?.startedAt ?? null,
    confidence,
    dimensions: {
      accuracy: b.accuracy ?? null,
      completeness: b.completeness ?? null,
      freshness: b.freshness ?? null,
      provenance: b.provenance ?? null,
      certification,
      blockerCount: b.blockerCount ?? issues.length,
      coverageGapCount: b.coverageGapCount ?? 0,
    },
    topIssues: issues,
  })
}
