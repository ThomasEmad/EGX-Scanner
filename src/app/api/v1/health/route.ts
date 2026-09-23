import { db } from "@/lib/db"

// GET /api/v1/health — basic system health for monitoring.
export async function GET() {
  try {
    await db.company.count()
    return Response.json({ ok: true, service: "egx-financial-scanner", database: "connected", time: new Date().toISOString() })
  } catch (e) {
    return Response.json({ ok: false, database: "error", message: e instanceof Error ? e.message : "unknown" }, { status: 500 })
  }
}
