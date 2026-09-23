import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/dividends — dividend records. Missing official dates
// are never inferred; the API returns nulls and the notes explain why.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const dividends = await db.dividend.findMany({
    where: { companyId: id },
    orderBy: [{ announcementDate: "desc" }],
  })

  return Response.json({ dividends })
}
