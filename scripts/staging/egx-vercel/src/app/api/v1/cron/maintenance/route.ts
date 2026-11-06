import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { secureBearerMatch } from "@/lib/secure-compare"

// GET /api/v1/cron/maintenance — periodic DB hygiene for production.
// Protected with `Authorization: Bearer $CRON_SECRET` (timing-safe), same as
// the other cron endpoints. Safe to call repeatedly; every step is a bounded
// deleteMany with an explicit cutoff (no full-table scans, no VACUUM).
//
// Steps:
//   1. Sessions with expiresAt < now          (login sessions, 7-day TTL)
//   2. AdminSession with expiresAt < now      (admin console sessions)
//   3. PasswordResetToken: expired, or used more than 7 days ago
//   4. AuditLog older than 365 days           (conservative retention)
//   5. WAL checkpoint TRUNCATE                (keeps -wal file from growing)
//
// Wire it to the platform scheduler (daily is plenty):
//   curl -H "Authorization: Bearer $CRON_SECRET" https://host/api/v1/cron/maintenance

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false // disabled unless explicitly configured
  return secureBearerMatch(req.headers.get("authorization"), secret)
}

const AUDIT_RETENTION_DAYS = 365

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }

  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const auditCutoff = new Date(now.getTime() - AUDIT_RETENTION_DAYS * 24 * 60 * 60 * 1000)

  const summary: Record<string, number | string> = { ranAt: now.toISOString() }

  try {
    summary.sessionsDeleted = await db.session.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count)
    summary.adminSessionsDeleted = await db.adminSession.deleteMany({ where: { expiresAt: { lt: now } } }).then((r) => r.count)
    summary.resetTokensDeleted = await db.passwordResetToken
      .deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { lt: weekAgo } }] } })
      .then((r) => r.count)
    summary.auditLogDeleted = await db.auditLog.deleteMany({ where: { createdAt: { lt: auditCutoff } } }).then((r) => r.count)

    // Fold the WAL back into the main DB file so it never grows unbounded.
    // NOTE: PRAGMA statements return a result row, so this must go through
    // $queryRawUnsafe — $executeRawUnsafe rejects queries that return results.
    await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);")

    return Response.json({ ok: true, summary })
  } catch (e) {
    console.error("[cron/maintenance] failed", e)
    return Response.json({ ok: false, error: "MAINTENANCE_FAILED", summary }, { status: 500 })
  }
}
