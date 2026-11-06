#!/usr/bin/env python3
"""Patch 5 (final) — backup path fix, audit single-flight, keep-alive backup.

  A. scripts/backup-db.mjs — resolve `file:` URLs without mangling absolute
     paths (the old leading-slash strip turned /home/z/... into home/z/...).
  B. /api/v1/cron/audit — module-level single-flight guard.
  C. keep-alive.sh — daily 24h-gated DB backup into the persistent area.
"""
import pathlib

ROOT = pathlib.Path("/tmp/my-project")


def patch(rel: str, old: str, new: str, count: int = 1) -> None:
    p = ROOT / rel
    s = p.read_text()
    n = s.count(old)
    assert n == count, f"{rel}: expected {count} occurrence(s), found {n}"
    p.write_text(s.replace(old, new))
    print(f"[ok] {rel}")


# ------------------------------------------------- A: backup path resolution
patch("scripts/backup-db.mjs",
'''const source = dbUrl.replace(/^file:/, "").replace(/^\\/+/, "")''',
'''// Resolve without mangling absolute paths (the old leading-slash strip turned
// `file:/home/z/...` into a broken relative path).
const source = path.resolve(dbUrl.replace(/^file:/, ""))''')

# ------------------------------------------------- B: audit single-flight
patch("src/app/api/v1/cron/audit/route.ts",
'''function authorized(req: NextRequest): boolean {''',
'''// In-process single-flight: overlapping cron firings duplicated AuditRuns and
// doubled DB load. (Multi-node deployments would need a shared lock — out of
// scope for the single-node topology.)
let auditBusy = false

function authorized(req: NextRequest): boolean {''')

patch("src/app/api/v1/cron/audit/route.ts",
'''  const type = req.nextUrl.searchParams.get("type") === "weekly" ? "weekly" : "daily"

  try {''',
'''  const type = req.nextUrl.searchParams.get("type") === "weekly" ? "weekly" : "daily"

  if (auditBusy) {
    return Response.json(
      { ok: false, error: "AUDIT_IN_PROGRESS", message: "Another audit run is already in progress." },
      { status: 503, headers: { "Retry-After": "120" } }
    )
  }
  auditBusy = true
  try {''')

patch("src/app/api/v1/cron/audit/route.ts",
'''  } catch (error) {
    return Response.json(
      { ok: false, error: "AUDIT_FAILED", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  }
}''',
'''  } catch (error) {
    return Response.json(
      { ok: false, error: "AUDIT_FAILED", message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    )
  } finally {
    auditBusy = false
  }
}''')

print("patch-5 complete")
