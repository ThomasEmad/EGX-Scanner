import { db } from "@/lib/db"
import { buildCoverageReport } from "@/lib/financial/analysis/coverage-report"
import { reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/companies/[id]/coverage — per-statement extraction coverage report.
//
// Spec section 27: For every real report, produce an extraction coverage report.
// Returns:
//   - Per-statement coverage (Income Statement / Balance Sheet / Cash Flow / Notes)
//   - Breakdown coverage (TOTAL_DEBT → ST + LT + LEASES, etc.)
//   - Investor-relevance tier coverage (CRITICAL / HIGH / MEDIUM / LOW)
//   - Quality dimensions (statement, breakdown, critical, investor, note, overall)
//   - Red flags — material gaps that should be addressed
//
// Query params:
//   ?reportId=<id>   — restrict to a single report (otherwise aggregates latest)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const reportId = url.searchParams.get("reportId")

  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  // Choose report(s) to analyze
  let reports
  if (reportId) {
    reports = await db.financialReport.findMany({
      where: { id: reportId, companyId: id, deletedAt: null },
      include: { values: true },
    })
    if (reports.length === 0) {
      return Response.json({ error: "REPORT_NOT_FOUND" }, { status: 404 })
    }
  } else {
    // Use latest validated/approved report per period
    const allReports = await db.financialReport.findMany({
      where: {
        companyId: id,
        processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] },
        deletedAt: null,
      },
      include: { values: true },
      orderBy: { fiscalYear: "desc" },
    })
    if (allReports.length === 0) {
      return Response.json({
        companyId: id,
        companyName: company.nameEn,
        ticker: company.ticker,
        sector: company.sector,
        generatedAt: new Date().toISOString(),
        error: "NO_DATA",
        message: "No validated financial reports available for this company.",
        coverage: null,
      }, { status: 200 })
    }
    reports = [allReports[0]] // latest
  }

  const report = reports[0]
  const foundCodes = new Set<string>()
  for (const v of report.values) {
    if (v.validationStatus !== "FAILED") {
      foundCodes.add(v.metricCode)
    }
  }

  const coverage = buildCoverageReport({
    companyId: id,
    sector: company.sector,
    periodKey: reportPeriodKey(report),
    foundCodes,
  })

  return Response.json({
    companyId: id,
    companyName: company.nameEn,
    ticker: company.ticker,
    sector: company.sector,
    reportId: report.id,
    reportLabel: report.periodLabel,
    generatedAt: new Date().toISOString(),
    coverage,
    foundMetricCount: foundCodes.size,
    totalMetricCount: coverage.statements.reduce((s, r) => s + r.expectedCount, 0),
  })
}
