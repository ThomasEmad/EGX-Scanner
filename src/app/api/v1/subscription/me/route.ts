import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser } from "@/lib/auth"
import { getSubscriptionSummary } from "@/lib/subscription"
import { audit } from "@/lib/audit"

// GET /api/v1/subscription/me
export async function GET(req: NextRequest) {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  const summary = await getSubscriptionSummary(userId)
  return Response.json(summary)
}
