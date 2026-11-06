import { db } from "@/lib/db"
import { findCompanyByKey } from "@/lib/company-lookup"

// GET /api/v1/companies/[id]/dividends — dividend records. Missing official dates
// are never inferred; the API returns nulls and the notes explain why.
// `[id]` accepts company id, ticker or ISIN (see findCompanyByKey).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await findCompanyByKey(id)
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const dividends = await db.dividend.findMany({
    where: { companyId: company.id },
    orderBy: [{ announcementDate: "desc" }],
  })

  return Response.json({ dividends })
}
