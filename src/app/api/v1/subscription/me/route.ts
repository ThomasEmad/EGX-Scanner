import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { requireAuth } from "@/lib/access"
import { getSubscriptionSummary } from "@/lib/subscription"
import { getSmartAnalysisUsage } from "@/lib/smart-analysis-usage"

// GET /api/v1/subscription/me — current user's subscription status + smart analysis usage
export async function GET(req: NextRequest) {
  const userId = await requireAuth(req)
  if (!userId) {
    return Response.json({ error: "UNAUTHENTICATED", message: "Authentication required." }, { status: 401 })
  }

  const summary = await getSubscriptionSummary(userId)
  const usage = await getSmartAnalysisUsage(userId)

  return Response.json({
    ...summary,
    smartAnalysisUsage: usage,
  })
}
