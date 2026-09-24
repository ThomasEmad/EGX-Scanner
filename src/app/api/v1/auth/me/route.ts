import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { getSubscriptionSummary } from "@/lib/subscription"

// GET /api/v1/auth/me
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  })
  if (!user) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  const subscription = await getSubscriptionSummary(userId)
  return Response.json({ user, subscription })
}
