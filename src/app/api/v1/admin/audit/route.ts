import { NextRequest } from "next/server"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"

// GET  /api/v1/admin/audit — list recent audit runs (newest first).
// POST /api/v1/admin/audit — trigger a full audit run (all active companies).
// Long-running (~10-60s): clients should await the final JSON response.

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()

  const runs = await db.auditRun.findMany({
    orderBy: { startedAt: "desc" },
    take: 30,
    select: {
      id: true, type: true, status: true, startedAt: true, endedAt: true,
      durationSec: true, companiesChecked: true, issuesFound: true,
    },
  })
  return Response.json({ runs })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()

  let type: "daily" | "weekly" | "manual" = "manual"
  try {
    const body = await req.json()
    if (body?.type && ["daily", "weekly", "manual"].includes(body.type)) type = body.type
  } catch {}

  const { runFullAudit } = await import("@/lib/audit/audit-runner")
  const summary = await runFullAudit({ type, persist: true })

  // confidence badges on market/company pages — refresh caches
  const { invalidateServerCache } = await import("@/lib/server-cache")
  invalidateServerCache()

  await audit("DATA_QUALITY_AUDIT", {
    actor: "admin",
    entityType: "AuditRun",
    entityId: summary.runId,
    details: `Audit (${type}): ${summary.companiesChecked} companies, ${summary.issuesFound.total} issues in ${summary.durationSec}s`,
  })

  return Response.json({
    ok: true,
    runId: summary.runId,
    durationSec: summary.durationSec,
    companiesChecked: summary.companiesChecked,
    issues: summary.issuesFound,
    byCategory: summary.byCategory,
  })
}
