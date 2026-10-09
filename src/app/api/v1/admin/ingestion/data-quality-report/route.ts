import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { isAdmin } from "@/lib/admin-auth"
import { unauthorizedResponse } from "@/lib/access"
import { generateDataQualityReport } from "@/lib/ingestion/missing-periods"

// GET /api/v1/admin/ingestion/data-quality-report — generate a comprehensive
// data quality report across companies, identifying missing periods and
// coverage gaps.
//
// Query params:
//   companyId (optional) — limit to a single company
//   lookbackYears (optional, default 3) — how many years back to scan
export async function GET(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()
  const url = new URL(req.url)
  const companyId = url.searchParams.get("companyId")
  const lookbackYears = Number(url.searchParams.get("lookbackYears") ?? "3")

  const companies = companyId
    ? await db.company.findMany({ where: { id: companyId } })
    : await db.company.findMany({ where: { isActive: true }, take: 50 })

  const reports: unknown[] = []
  let totalMissing = 0
  let overallScoreSum = 0
  for (const company of companies) {
    try {
      const r = await generateDataQualityReport(company.id, lookbackYears)
      reports.push(r)
      totalMissing += r.missingPeriods.length
      overallScoreSum += r.overallCompleteness
    } catch (err) {
      reports.push({
        companyId: company.id,
        ticker: company.ticker,
        nameEn: company.nameEn,
        sector: company.sector,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  const averageScore = companies.length > 0 ? Math.round((overallScoreSum / companies.length) * 100) / 100 : 0
  return Response.json({
    generatedAt: new Date().toISOString(),
    companiesScanned: companies.length,
    totalMissingPeriods: totalMissing,
    averageOverallCompleteness: averageScore,
    reports,
  })
}
