import { NextRequest } from "next/server"
import { db } from "@/lib/db"

const STATUSES = ["ANNOUNCED", "UPCOMING", "ELIGIBLE", "PAID", "EXPIRED", "CANCELLED"]

// GET /api/v1/dividends — dividend records with optional status filter.
// Dates that are not officially available are returned as null (never inferred).
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const status = url.searchParams.get("status")?.trim() || ""

  const where: Record<string, unknown> = {}
  if (status && STATUSES.includes(status)) where.status = status

  const dividends = await db.dividend.findMany({
    where,
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true } },
    },
    orderBy: [{ announcementDate: "desc" }],
  })

  return Response.json({ dividends })
}
