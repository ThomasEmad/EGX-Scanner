import { NextRequest } from "next/server"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { WHITELIST, startJob, killJob, listRuns, runningJobs, tailLog, anyRunning } from "@/lib/admin-ops"

// GET  /api/v1/admin/ops                 → whitelist metadata + running jobs + recent runs
// GET  /api/v1/admin/ops?log=<runId>     → tail a run's log
// POST /api/v1/admin/ops { job: "key" }  → start a whitelisted script in the background
// POST /api/v1/admin/ops { stop: "runId" } → stop a running job (SIGTERM → SIGKILL)
//
// Only whitelisted scripts run (fixed argv, no user input in the command line),
// one at a time, journal persisted to reports/admin-ops-journal.json.

export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const url = new URL(req.url)
  const runId = url.searchParams.get("log")
  if (runId) {
    const lines = Math.min(Number(url.searchParams.get("lines") ?? 120) || 120, 400)
    const res = tailLog(runId, lines)
    if (!res.ok) return Response.json(res, { status: 404 })
    return Response.json(res)
  }
  return Response.json({
    jobs: WHITELIST,
    running: runningJobs(),
    busy: anyRunning(),
    runs: listRuns(20),
  })
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const body = await req.json().catch(() => null) as { job?: string; stop?: string } | null

  // Stop a running job.
  if (body?.stop) {
    const res = killJob(body.stop, "admin")
    if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 409 })
    await audit("OPS_JOB_STOP", {
      actor: "admin",
      entityType: "AdminOpsJob",
      entityId: res.entry.id,
      details: `ops job stopped by admin: ${res.entry.job} (pid ${res.entry.pid})`,
    })
    return Response.json({ ok: true, run: res.entry })
  }

  const key = body?.job
  if (!key) return Response.json({ error: "job or stop is required" }, { status: 400 })

  const res = startJob(key)
  if (!res.ok) return Response.json({ ok: false, error: res.error }, { status: 409 })

  await audit("OPS_JOB", {
    actor: "admin",
    entityType: "AdminOpsJob",
    entityId: res.entry.id,
    details: `ops job started: ${key} → node ${res.entry.script} ${res.entry.args.join(" ")}`,
  })
  return Response.json({ ok: true, run: res.entry })
}
