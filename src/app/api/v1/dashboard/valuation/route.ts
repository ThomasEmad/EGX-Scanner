import { marketValuationScreen } from "@/lib/financial/scores"

// GET /api/v1/dashboard/valuation — market-wide valuation screen:
// companies ranked by discount vs their sector median P/E & P/B.
export async function GET() {
  const results = await marketValuationScreen(24)
  return Response.json({ results })
}
