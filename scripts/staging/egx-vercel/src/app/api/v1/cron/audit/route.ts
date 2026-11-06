import { NextRequest } from "next/server"
import { secureBearerMatch } from "@/lib/secure-compare"

// GET /api/v1/cron/audit?type=daily|weekly — scheduled audit entry point.
// Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET` when the
// CRON_SECRET env var is configured (timing-safe comparison). Also usable by
// any scheduler with the same bearer header. Runs the full audit and returns
// the run summary.
// (runFullAudit owns the AuditRun lifecycle, including failure status.)

// In-process single-flight: overlapping cron firings duplicated AuditRuns and
// doubled DB load. (Multi-node deployments would need a shared lock — out of
// scope for the single-node topology.)
let auditBusy = false

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // cron disabled unless explicitly configured
  return secureBearerMatch(req.headers.get("authorization"), secret)
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const type = req.nextUrl.searchParams.get("type") === "weekly" ? "weekly" : "daily"

  if (auditBusy) {
    return Response.json(
      { ok: false, error: "AUDIT_IN_PROGRESS", message: "Another audit run is already in progress." },
      { status: 503, headers: { "Retry-After": "120" } }
    )
  }
  auditBusy = true
  try {
    const { runFullAudit } = await import("@/lib/audit/audit-runner")
    const summary = await runFullAudit({ type, persist: true })
    const { invalidateServerCache } = await import("@/lib/server-cache")
    invalidateServerCache()
    return Response.json({
      ok: true,
      scheduledType: type,
      runId: summary.runId,
      durationSec: summary.durationSec,
      companiesChecked: summary.companiesChecked,
      issues: summary.issuesFound,
      byCategory: summary.byCategory,
    })
  } catch (error) {
    return Response.json(
      { ok: false, error: "AUDIT_FAILED", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  } finally {
    auditBusy = false
  }
}
