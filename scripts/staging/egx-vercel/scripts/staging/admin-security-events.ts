import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"

// GET /api/v1/admin/security-events — the most recent authentication-related
// audit rows (reset requests/tokens, OAuth sign-ins, login failures). The
// password-reset delivery in this deployment is admin-mediated: the raw
// single-use token appears here and the admin hands it to the user over a
// trusted channel. Admin session required.

const ACTIONS = [
  "PASSWORD_RESET_REQUEST",
  "PASSWORD_RESET_COMPLETED",
  "PASSWORD_RESET_FAILED",
  "OAUTH_LOGIN",
  "OAUTH_SIGNUP",
  "LOGIN_FAILED",
  "ADMIN_LOGIN",
]

export async function GET(req: NextRequest) {
  const userId = await getSessionUser(req.headers.get("x-session-token"))
  if (!userId) return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== "admin") return Response.json({ error: "FORBIDDEN" }, { status: 403 })

  const limit = Math.min(100, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 40) || 40))
  const events = await db.auditLog.findMany({
    where: { action: { in: ACTIONS } },
    select: { id: true, action: true, actor: true, details: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: limit,
  })

  return Response.json(
    { events },
    { headers: { "Cache-Control": "no-store" } }
  )
}
