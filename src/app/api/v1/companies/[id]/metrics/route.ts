import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"

// GET /api/v1/companies/[id]/metrics — calculated metrics matrix across periods
// (with value status + formula version for auditability).

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const metrics = await db.calculatedMetric.findMany({
    where: { companyId: id },
    orderBy: [{ code: "asc" }, { periodKey: "asc" }],
  })

  const periodMap = new Map<string, { key: string; label: string; periodType: string; fiscalYear: number }>()
  const rowsMap = new Map<string, { code: string; cells: Record<string, { value: number | null; status: string; detail: string | null; formulaVersion: string }> }>()

  for (const m of metrics) {
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
  const rows = [...rowsMap.values()].map((r) => ({
    ...r,
    labelEn: CALC_METRIC_MAP[r.code]?.labelEn ?? r.code,
    labelAr: CALC_METRIC_MAP[r.code]?.labelAr ?? r.code,
    unit: CALC_METRIC_MAP[r.code]?.unit ?? "RATIO",
    kind: CALC_METRIC_MAP[r.code]?.kind ?? "passthrough",
  }))

  return Response.json({ periods, rows })
}
