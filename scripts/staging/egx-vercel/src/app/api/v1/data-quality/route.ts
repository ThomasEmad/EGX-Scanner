import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { classifyStoredIssue, ROOT_CAUSE_LABELS, ISSUE_CLASS_LABELS, type RootCause, type IssueClass } from "@/lib/audit/issue-class"

// GET /api/v1/data-quality
// ADMIN-ONLY view of the latest full audit. Every issue is classified
// deterministically from its stored description, so the API and the audit
// runner always agree on blocker / coverage / advisory / metadata.
//
// Query params (all optional):
//   ticker, class (blocker|coverage|advisory|metadata), rootCause, severity,
//   certification (certified|provisional|review_required), q (free text),
//   format=csv, limit, offset

const CERT_LABELS: Record<string, { en: string; ar: string }> = {
  certified: { en: "Certified", ar: "معتمد" },
  provisional: { en: "Provisional", ar: "مؤقت" },
  review_required: { en: "Review required", ar: "يتطلب مراجعة" },
}

interface Breakdown {
  accuracy?: number
  completeness?: number
  freshness?: number
  provenance?: number
  certification?: string
  blockerCount?: number
  coverageGapCount?: number
}

function parseBreakdown(json: string): Breakdown {
  try { return JSON.parse(json) as Breakdown } catch { return {} }
}

function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(req: NextRequest) {
  // Internal audit data — never exposed to end users.
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const url = new URL(req.url)
  const p = url.searchParams
  const run = await db.auditRun.findFirst({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, endedAt: true, durationSec: true, companiesChecked: true, issuesFound: true },
  })
  if (!run) return Response.json({ error: "NO_RUN" }, { status: 404 })

  const [issueRows, scoreRows] = await Promise.all([
    db.auditIssue.findMany({
      where: { auditRunId: run.id, status: "open" },
      orderBy: [{ severity: "asc" }, { ticker: "asc" }, { period: "asc" }],
      select: {
        id: true, ticker: true, metricCode: true, period: true, category: true, severity: true,
        description: true, descriptionAr: true, currentValue: true, expectedValue: true,
        detectedAt: true, status: true,
      },
    }),
    db.companyConfidenceScore.findMany({
      where: { auditRunId: run.id },
      include: { company: { select: { ticker: true, nameEn: true, nameAr: true, sector: true } } },
      orderBy: { score: "asc" },
    }),
  ])

  const classified = issueRows.map((r) => {
    const c = classifyStoredIssue(r)
    return {
      ...r,
      issueClass: c.issueClass,
      rootCause: c.rootCause,
      rootCauseLabel: ROOT_CAUSE_LABELS[c.rootCause as RootCause] ?? null,
      issueClassLabel: ISSUE_CLASS_LABELS[c.issueClass as IssueClass] ?? null,
    }
  })

  // ---- summary over the whole run (never affected by filters) ----
  const byClass: Record<string, number> = { blocker: 0, coverage: 0, advisory: 0, metadata: 0 }
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 }
  const byRootCause: Record<string, number> = {}
  const byCategory: Record<string, number> = {}
  for (const i of classified) {
    byClass[i.issueClass] = (byClass[i.issueClass] ?? 0) + 1
    bySeverity[i.severity] = (bySeverity[i.severity] ?? 0) + 1
    byRootCause[i.rootCause] = (byRootCause[i.rootCause] ?? 0) + 1
    byCategory[i.category] = (byCategory[i.category] ?? 0) + 1
  }

  const blockersByTicker: Record<string, number> = {}
  const rootsByTicker: Record<string, Set<string>> = {}
  for (const i of classified) {
    if (i.issueClass === "blocker") blockersByTicker[i.ticker] = (blockersByTicker[i.ticker] ?? 0) + 1
    if (!rootsByTicker[i.ticker]) rootsByTicker[i.ticker] = new Set()
    rootsByTicker[i.ticker].add(i.rootCause)
  }

  const companies = scoreRows.map((s) => {
    const b = parseBreakdown(s.breakdownJson)
    return {
      ticker: s.ticker,
      nameEn: s.company.nameEn,
      nameAr: s.company.nameAr,
      sector: s.company.sector,
      score: s.score,
      rating: s.rating,
      accuracy: b.accuracy ?? null,
      completeness: b.completeness ?? null,
      freshness: b.freshness ?? null,
      provenance: b.provenance ?? null,
      certification: b.certification ?? (b.blockerCount ? "review_required" : "provisional"),
      blockerCount: blockersByTicker[s.ticker] ?? b.blockerCount ?? 0,
      coverageGapCount: b.coverageGapCount ?? 0,
      rootCauses: [...(rootsByTicker[s.ticker] ?? [])],
    }
  })

  const certDistribution: Record<string, number> = { certified: 0, provisional: 0, review_required: 0 }
  for (const c of companies) certDistribution[c.certification] = (certDistribution[c.certification] ?? 0) + 1

  // ---- filters ----
  const ticker = (p.get("ticker") || "").toUpperCase()
  const issueClass = p.get("class") || ""
  const rootCause = p.get("rootCause") || ""
  const severity = p.get("severity") || ""
  const certification = p.get("certification") || ""
  const q = (p.get("q") || "").toLowerCase()
  const certTickers = certification
    ? new Set(companies.filter((c) => c.certification === certification).map((c) => c.ticker))
    : null

  const filtered = classified.filter((i) => {
    if (ticker && i.ticker !== ticker) return false
    if (issueClass && i.issueClass !== issueClass) return false
    if (rootCause && i.rootCause !== rootCause) return false
    if (severity && i.severity !== severity) return false
    if (certTickers && !certTickers.has(i.ticker)) return false
    if (q && !`${i.ticker} ${i.description} ${i.descriptionAr ?? ""} ${i.metricCode ?? ""} ${i.period ?? ""}`.toLowerCase().includes(q)) return false
    return true
  })
  const filteredCompanies = companies.filter((c) => {
    if (ticker && c.ticker !== ticker) return false
    if (certification && c.certification !== certification) return false
    if (issueClass === "blocker" && c.blockerCount === 0) return false
    if (issueClass === "coverage" && c.coverageGapCount === 0) return false
    if (rootCause && !c.rootCauses.includes(rootCause)) return false
    if (q && !`${c.ticker} ${c.nameEn} ${c.nameAr} ${c.sector}`.toLowerCase().includes(q)) return false
    return true
  })

  if (p.get("format") === "csv") {
    const header = ["ticker", "period", "metric", "severity", "issueClass", "rootCause", "category", "description", "recommendedAction"]
    const lines = [header.join(",")]
    for (const i of filtered) {
      lines.push([
        i.ticker, i.period ?? "", i.metricCode ?? "", i.severity, i.issueClass, i.rootCause, i.category,
        i.description,
        i.rootCauseLabel?.action?.en ?? "",
      ].map(csvEscape).join(","))
    }
    return new Response("\uFEFF" + lines.join("\r\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="egx-data-quality-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    })
  }

  const limit = Math.min(Math.max(Number(p.get("limit") ?? 300), 1), 1000)
  const offset = Math.max(Number(p.get("offset") ?? 0), 0)

  return Response.json({
    run: {
      id: run.id,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationSec: run.durationSec,
      companiesChecked: run.companiesChecked,
      issuesFound: run.issuesFound,
    },
    summary: {
      totalIssues: classified.length,
      byClass,
      bySeverity,
      byRootCause,
      byCategory,
      certification: certDistribution,
      certified: certDistribution.certified,
      provisional: certDistribution.provisional,
      reviewRequired: certDistribution.review_required,
    },
    filters: { ticker, issueClass, rootCause, severity, certification, q, limit, offset },
    totalFiltered: filtered.length,
    companies: filteredCompanies.slice(offset, offset + limit),
    totalCompanies: filteredCompanies.length,
    issues: filtered.slice(offset, offset + limit),
    certificationLabels: CERT_LABELS,
    rootCauseLabels: ROOT_CAUSE_LABELS,
    issueClassLabels: ISSUE_CLASS_LABELS,
  })
}
