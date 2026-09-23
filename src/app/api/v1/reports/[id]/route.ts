import { db } from "@/lib/db"

// GET /api/v1/reports/[id] — report detail incl. extracted values with full
// source traceability (original label, page, confidence, validation status).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await db.financialReport.findUnique({
    where: { id },
    include: {
      company: { select: { id: true, ticker: true, nameEn: true, nameAr: true } },
      values: { orderBy: { metricCode: "asc" } },
    },
  })
  if (!report) return Response.json({ error: "NOT_FOUND" }, { status: 404 })
  return Response.json({ report })
}
