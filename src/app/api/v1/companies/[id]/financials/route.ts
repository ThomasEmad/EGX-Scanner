import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import {
  CALC_STATEMENT_TYPES,
  TRUSTED_REPORT_STATUSES,
  availableReportStatementTypes,
  defaultStatementType,
} from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/financials — source financial values grouped by
// statement kind and period. Values keep their original label + unit + source
// traceability (spec #25).
//
// Statement-type aware (spec #23): consolidated vs standalone filings are kept
// separate and NEVER mixed. `?statementType=CONSOLIDATED|STANDALONE` selects one
// basis; when absent the default is CONSOLIDATED if the company has trusted
// consolidated reports, else STANDALONE, else whatever exists. Only trusted
// reports (VALIDATED / APPROVED / EXTRACTED — the calculation engine's trust
// boundary) contribute periods/statements.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const availableStatementTypes = await availableReportStatementTypes(id)
  const requested = new URL(req.url).searchParams.get("statementType")
  if (requested && !(CALC_STATEMENT_TYPES as readonly string[]).includes(requested)) {
    return Response.json(
      { error: "VALIDATION", message: "statementType must be CONSOLIDATED or STANDALONE" },
      { status: 400 }
    )
  }
  const statementType = requested ?? defaultStatementType(availableStatementTypes)

  // an explicitly requested type that has no trusted reports simply yields empty structures
  const values = statementType
    ? await db.financialValue.findMany({
        where: {
          companyId: id,
          validationStatus: "VALID",
          report: {
            processingStatus: { in: [...TRUSTED_REPORT_STATUSES] },
            statementType,
          },
        },
        include: {
          report: {
            select: { id: true, periodLabel: true, periodType: true, fiscalYear: true, processingStatus: true },
          },
        },
        orderBy: [{ reportId: "asc" }],
      })
    : []

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
    statementType,
    availableStatementTypes,
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
