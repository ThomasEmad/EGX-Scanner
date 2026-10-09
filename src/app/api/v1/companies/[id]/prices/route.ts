import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/prices — full price history for the chart.
// MarketPrice rows are harvested snapshots (multiple sources); the chart shows
// them all chronologically, the UI notes the freshest source.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const prices = await db.marketPrice.findMany({
    where: { companyId: id },
    orderBy: { asOf: "asc" },
    select: { asOf: true, price: true, currency: true, sourceName: true },
  })

  return Response.json({ prices })
}
