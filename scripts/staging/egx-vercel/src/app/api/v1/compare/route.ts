import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"

// GET /api/v1/compare?ids=a,b,c(,d) — side-by-side comparison of up to 4
// companies on their LATEST VERIFIED ANNUAL statements (each company's own
// latest fiscal year). One batched query; best value per row is marked client-side.
// year=YYYY → optional pin: compare on THAT fiscal year for every selected
// company — a like-for-like historical comparison. Companies without annual
// filings for the pinned year show dashes. The response carries `years`: every
// fiscal year where at least TWO of the selected companies have data, so the
// UI only offers comparisons that make sense.

const COMPARE_METRICS = [
  "revenue", "net_profit", "net_margin", "roe", "roa",
  "total_assets", "total_equity",
  "debt_to_equity", "eps", "p_e", "p_b", "market_cap",
] as const

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const ids = (url.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 4)
  if (ids.length < 2) {
    return Response.json({ error: "INVALID_PAYLOAD", message: "Provide 2-4 company ids." }, { status: 400 })
  }
  const rawYear = url.searchParams.get("year")
  const year = rawYear && /^\d{4}$/.test(rawYear) ? Number(rawYear) : null

  const companies = await db.company.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
  })
  if (companies.length < 2) {
    return Response.json({ error: "NOT_FOUND", message: "Fewer than 2 valid companies." }, { status: 404 })
  }

  // latest ANNUAL metrics per company, one query
  const rows = (await db.$queryRawUnsafe(
    `SELECT cm."companyId", cm.code, cm.value, cm."fiscalYear", cm."periodLabel"
     FROM CalculatedMetric cm
     WHERE cm."companyId" IN (${ids.map(() => "?").join(",")})
       AND cm."periodType" = 'ANNUAL' AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL
       AND cm.code IN (${COMPARE_METRICS.map(() => "?").join(",")})
     ORDER BY cm."fiscalYear" DESC`,
    ...ids, ...COMPARE_METRICS
  )) as { companyId: string; code: string; value: number; fiscalYear: number; periodLabel: string }[]

  const scopedRows = year ? rows.filter((r) => r.fiscalYear === year) : rows

  // Years where ≥2 of the selected companies have annual data — the only pins
  // that produce a meaningful side-by-side.
  const yearCounts = new Map<number, Set<string>>()
  for (const r of rows) {
    if (!yearCounts.has(r.fiscalYear)) yearCounts.set(r.fiscalYear, new Set())
    yearCounts.get(r.fiscalYear)!.add(r.companyId)
  }
  const years = [...yearCounts.entries()]
    .filter(([, cos]) => cos.size >= 2)
    .map(([y]) => y)
    .sort((a, b) => b - a)

  const byCompany = new Map<string, { fiscalYear: number; periodLabel: string; metrics: Record<string, number> }>()
  for (const r of scopedRows) {
    let entry = byCompany.get(r.companyId)
    if (!entry || r.fiscalYear > entry.fiscalYear) {
      entry = { fiscalYear: r.fiscalYear, periodLabel: r.periodLabel, metrics: {} }
      byCompany.set(r.companyId, entry)
    }
    if (r.fiscalYear === entry.fiscalYear && !entry.metrics[r.code]) entry.metrics[r.code] = r.value
  }

  const result = companies.map((c) => {
    const entry = byCompany.get(c.id)
    return {
      ...c,
      fiscalYear: entry?.fiscalYear ?? null,
      periodLabel: entry?.periodLabel ?? null,
      metrics: entry?.metrics ?? {},
    }
  })

  const metricDefs = COMPARE_METRICS.map((code) => ({
    code,
    labelEn: CALC_METRIC_MAP[code]?.labelEn ?? code,
    labelAr: CALC_METRIC_MAP[code]?.labelAr ?? code,
    unit: CALC_METRIC_MAP[code]?.unit ?? "RATIO",
  }))

  return Response.json({ companies: result, metricDefs, year, years })
}
