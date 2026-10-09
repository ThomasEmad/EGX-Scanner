import { NextRequest } from "next/server"
import { computeCompanyScores } from "@/lib/financial/scores"

// GET /api/v1/companies/[id]/scores — financial health scores (0-100 per
// component) derived from verified calculated metrics + sector-relative
// valuation. Free tier: overall only is also fine client-side; this endpoint
// returns everything (gating happens in the UI per the pricing model).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const scores = await computeCompanyScores(id)
  if (!scores) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  return Response.json(scores)
}
