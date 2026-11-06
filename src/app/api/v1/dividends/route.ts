import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { cachedResponse, queryKey } from "@/lib/public-cache"

const STATUSES = ["ANNOUNCED", "UPCOMING", "ELIGIBLE", "PAID", "EXPIRED", "CANCELLED"]

// GET /api/v1/dividends — dividend records with optional status filter.
// Dates that are not officially available are returned as null (never inferred).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get("status")?.trim() || ""

  const where: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) where.status = status

  return cachedResponse(`dividends:${queryKey(req, ["status"])}`, 3 * 60 * 1000, async () => {
    const dividends = await db.dividend.findMany({
      where,
      include: {
        company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true } },
      },
      orderBy: [{ announcementDate: "desc" }],
    })
    return { dividends }
  })
}
