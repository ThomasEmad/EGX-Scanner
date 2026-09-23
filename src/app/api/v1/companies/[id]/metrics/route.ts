import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"
import { CALC_STATEMENT_TYPES, fetchCalc, filterByPreference, type StatementPref } from "@/lib/financial/statement-pref"

// GET /api/v1/companies/[id]/metrics — calculated metrics matrix across periods
// (with value status + formula version for auditability).
//
// Statement-type aware: CalculatedMetric rows exist per statement type
// (CONSOLIDATED | STANDALONE) and are NEVER mixed. Default is the company's
// preference (CONSOLIDATED when it has any consolidated rows, else STANDALONE);
// `?statementType=CONSOLIDATED|STANDALONE` overrides explicitly.

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const { rows, pref } = await fetchCalc(id)
  // CONSOLIDATED before STANDALONE when both exist
  const availableStatementTypes = [...new Set(rows.map((r) => r.statementType))].sort((a, b) => a.localeCompare(b))

  const requested = new URL(req.url).searchParams.get("statementType")
  if (requested && !(CALC_STATEMENT_TYPES as readonly string[]).includes(requested)) {
    return Response.json(
      { error: "VALIDATION", message: "statementType must be CONSOLIDATED or STANDALONE" },
      { status: 400 }
    )
  }
  const statementType = requested ?? pref
  const active = requested ? filterByPreference(rows, requested as StatementPref) : rows.filter((r) => r.statementType === statementType)

  const periodMap = new Map<string, { key: string; label: string; periodType: string; fiscalYear: number }>()
  const rowsMap = new Map<string, { code: string; cells: Record<string, { value: number | null; status: string; detail: string | null; formulaVersion: string }> }>()

  for (const m of active) {
    if (!periodMap.has(m.periodKey)) {
      periodMap.set(m.periodKey, { key: m.periodKey, label: m.periodLabel, periodType: m.periodType, fiscalYear: m.fiscalYear })
    }
    if (!rowsMap.has(m.code)) rowsMap.set(m.code, { code: m.code, cells: {} })
    rowsMap.get(m.code)!.cells[m.periodKey] = {
      value: m.value,
      status: m.valueStatus,
      detail: m.statusDetail,
      formulaVersion: m.formulaVersion,
    }
  }

  const periods = [...periodMap.values()].sort((a, b) => a.key.localeCompare(b.key))
  const metricRows = [...rowsMap.values()].map((r) => ({
    ...r,
    labelEn: CALC_METRIC_MAP[r.code]?.labelEn ?? r.code,
    labelAr: CALC_METRIC_MAP[r.code]?.labelAr ?? r.code,
    unit: CALC_METRIC_MAP[r.code]?.unit ?? "RATIO",
    kind: CALC_METRIC_MAP[r.code]?.kind ?? "passthrough",
  }))

  return Response.json({ statementType, availableStatementTypes, periods, rows: metricRows })
}
