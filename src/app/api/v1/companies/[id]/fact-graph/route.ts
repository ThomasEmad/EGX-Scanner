import { db } from "@/lib/db"
import { buildFactGraphTree, FACT_GRAPH_EDGES, getBreakdownChildren, getNoteLinks, getDerivationInputs, getDerivationOutputs } from "@/lib/financial/ontology/fact-graph"
import { RAW_METRIC_MAP } from "@/lib/financial/registry"
import { reportPeriodKey } from "@/lib/financial/periods"

// GET /api/v1/companies/[id]/fact-graph — financial fact graph for a company.
//
// Spec section 19 (Build a Financial Fact Graph): total → breakdown
// relationships (TOTAL_DEBT → ST + LT + LEASES), primary statement → notes,
// derivation chain (EPS → NET_PROFIT, WEIGHTED_AVG_SHARES).
//
// Query params:
//   ?reportId=<id>   — restrict to a single report (otherwise latest)
//   ?metric=<code>   — drill down on a single metric (returns its tree)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const url = new URL(req.url)
  const reportId = url.searchParams.get("reportId")
  const focusMetric = url.searchParams.get("metric")

  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  let reports
  if (reportId) {
    reports = await db.financialReport.findMany({
      where: { id: reportId, companyId: id, deletedAt: null },
      include: { values: true },
    })
  } else {
    const allReports = await db.financialReport.findMany({
      where: {
        companyId: id,
        processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] },
        deletedAt: null,
      },
      include: { values: true },
      orderBy: { fiscalYear: "desc" },
    })
    reports = allReports.length > 0 ? [allReports[0]] : []
  }

  if (reports.length === 0) {
    return Response.json({
      companyId: id,
      companyName: company.nameEn,
      generatedAt: new Date().toISOString(),
      error: "NO_DATA",
      message: "No validated financial reports available for this company.",
      graph: null,
    }, { status: 200 })
  }

  const report = reports[0]
  const foundValues = new Map<string, { value: number; originalLabel?: string; confidence?: number; sourcePage?: number | null; validationStatus?: string }>()
  for (const v of report.values) {
    foundValues.set(v.metricCode, {
      value: v.normalizedValue,
      originalLabel: v.originalLabel ?? undefined,
      confidence: v.confidence ?? undefined,
      sourcePage: v.sourcePage,
      validationStatus: v.validationStatus ?? undefined,
    })
  }

  // If a focus metric is requested, drill down on just that metric
  if (focusMetric) {
    const tree = buildFactGraphTree(focusMetric)
    const breakdownChildren = getBreakdownChildren(focusMetric)
    const noteLinks = getNoteLinks(focusMetric)
    const derivInputs = getDerivationInputs(focusMetric)
    const derivOutputs = getDerivationOutputs(focusMetric)
    const foundChildren = breakdownChildren.filter((c) => foundValues.has(c))
    const missingChildren = breakdownChildren.filter((c) => !foundValues.has(c))
    return Response.json({
      companyId: id,
      companyName: company.nameEn,
      reportId: report.id,
      reportLabel: report.periodLabel,
      generatedAt: new Date().toISOString(),
      focusMetric,
      metricDef: RAW_METRIC_MAP[focusMetric] ?? null,
      value: foundValues.get(focusMetric) ?? null,
      tree,
      breakdownChildren,
      foundChildren,
      missingChildren,
      noteLinks,
      derivationInputs: derivInputs,
      derivationOutputs: derivOutputs,
      // For each breakdown child, return its extracted value (or null if missing)
      breakdownValues: breakdownChildren.map((c) => ({
        metricCode: c,
        metricDef: RAW_METRIC_MAP[c] ?? null,
        value: foundValues.get(c) ?? null,
      })),
    })
  }

  // Default — return the full graph keyed by parent metric
  const parents = Array.from(new Set(FACT_GRAPH_EDGES.map((e) => e.from)))
  const graph = parents.map((parent) => {
    const children = getBreakdownChildren(parent)
    const noteLinks = getNoteLinks(parent)
    return {
      parent,
      parentDef: RAW_METRIC_MAP[parent] ?? null,
      parentValue: foundValues.get(parent) ?? null,
      breakdownChildren: children.map((c) => ({
        metricCode: c,
        metricDef: RAW_METRIC_MAP[c] ?? null,
        value: foundValues.get(c) ?? null,
      })),
      noteLinks: noteLinks.map((c) => ({
        metricCode: c,
        metricDef: RAW_METRIC_MAP[c] ?? null,
        value: foundValues.get(c) ?? null,
      })),
    }
  }).filter((g) => g.breakdownChildren.length > 0 || g.noteLinks.length > 0)

  return Response.json({
    companyId: id,
    companyName: company.nameEn,
    ticker: company.ticker,
    sector: company.sector,
    reportId: report.id,
    reportLabel: report.periodLabel,
    periodKey: reportPeriodKey(report),
    generatedAt: new Date().toISOString(),
    graph,
    totalEdges: FACT_GRAPH_EDGES.length,
    totalParents: graph.length,
    extractedValueCount: foundValues.size,
  })
}
