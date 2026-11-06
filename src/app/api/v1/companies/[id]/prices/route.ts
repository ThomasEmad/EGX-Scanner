import { db } from "@/lib/db"
import { findCompanyByKey } from "@/lib/company-lookup"

// GET /api/v1/companies/[id]/prices — full price history for the chart.
// `[id]` accepts company id, ticker or ISIN (see findCompanyByKey).
// MarketPrice rows are harvested snapshots; the chart shows them all
// chronologically. `sourceName` (which harvester produced the row) is data
// provenance — it stays internal and is NOT returned to end users.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await findCompanyByKey(id)
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const prices = await db.marketPrice.findMany({
    where: { companyId: company.id },
    orderBy: { asOf: "asc" },
    select: { asOf: true, price: true, currency: true },
  })

  return Response.json({ prices })
}
