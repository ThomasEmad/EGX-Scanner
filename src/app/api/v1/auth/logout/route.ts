import { NextRequest } from "next/server"
import { getSessionUser, invalidateSession } from "@/lib/auth"
import { audit } from "@/lib/audit"

// POST /api/v1/auth/logout
export async function POST(req: NextRequest) {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (userId) {
    invalidateSession(token)
    await audit("USER_LOGOUT", { actor: userId, entityType: "User", entityId: userId, details: "Logout" })
  }
  return Response.json({ ok: true })
}
