import { db } from "@/lib/db"

// GET /api/v1/companies/[id]/financials — source financial values grouped by
// statement type and period. Values keep their original label + unit + source
// traceability (spec #25).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const values = await db.financialValue.findMany({
    where: { companyId: id, validationStatus: "VALID" },
    include: {
      report: {
        select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, processingStatus: true },
      },
    },
    orderBy: [{ reportId: "asc" }],
  })

  // period columns sorted ascending
  const periodMap = new Map<string, { key: string; label: string; periodType: string; fiscalYear: number }>()
  for (const v of values) {
    const key = `${v.report.periodType}:${v.report.fiscalYear}:${subOf(v.report.periodLabel, v.report.periodType)}`
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        key,
        label: v.report.periodLabel,
        periodType: v.report.periodType,
        fiscalYear: v.report.fiscalYear,
      })
    }
  }
  const periods = [...periodMap.values()].sort((a, b) => a.key.localeCompare(b.key))

  const rowsMap = new Map<string, {
    code: string
    statementType: string
    cells: Record<string, { value: number; unit: string; normalizedValue: number; label: string; reportId: string }>
  }>()
  for (const v of values) {
    const key = `${v.report.periodType}:${v.report.fiscalYear}:${subOf(v.report.periodLabel, v.report.periodType)}`
    if (!rowsMap.has(v.metricCode)) {
      rowsMap.set(v.metricCode, { code: v.metricCode, statementType: v.statementType, cells: {} })
    }
    rowsMap.get(v.metricCode)!.cells[key] = {
      value: v.value,
      unit: v.unit,
      normalizedValue: v.normalizedValue,
      label: v.originalLabel,
      reportId: v.reportId,
    }
  }

  const rows = [...rowsMap.values()]

  return Response.json({
    periods,
    statements: {
      INCOME_STATEMENT: rows.filter((r) => r.statementType === "INCOME_STATEMENT"),
      BALANCE_SHEET: rows.filter((r) => r.statementType === "BALANCE_SHEET"),
      CASH_FLOW: rows.filter((r) => r.statementType === "CASH_FLOW"),
      OTHER: rows.filter((r) => r.statementType === "OTHER"),
    },
  })
}

function subOf(label: string, periodType: string): string {
  const up = label.toUpperCase()
  if (periodType === "QUARTERLY") return up.match(/Q([1-4])/)?.[0] ?? ""
  if (periodType === "SEMIANNUAL") return up.match(/H([1-2])/)?.[0] ?? ""
  return ""
}
