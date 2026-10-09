import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { CALC_METRIC_MAP } from "@/lib/financial/registry"

// GET /api/v1/rankings?metric=roe&sector=Banks&order=desc&basis=latest
// basis=latest  → each company's LATEST ANNOUNCED period (Q1/H1/9M/Q4) — the
//                 freshest figures on the site (default, per user request)
// basis=annual  → each company's latest verified ANNUAL value
// Mixed periods are expected under `latest` (companies announce at different
// cadences) — every row displays its own periodLabel so nothing is hidden.

interface RankRow {
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  value: number
  fiscalYear: number
  periodLabel: string
  periodType: string
}

// chronological index within a fiscal year from the period label
function quarterIndex(periodType: string, periodLabel: string): number {
  const q = periodLabel.match(/Q([1-4])/)
  if (q) return Number(q[1])
  if (/9M/i.test(periodLabel)) return 3
  if (/H1/i.test(periodLabel)) return 2
  if (periodType === "ANNUAL") return 4
  return 0
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const metric = url.searchParams.get("metric") ?? "roe"
  if (!CALC_METRIC_MAP[metric]) {
    return Response.json({ error: "UNKNOWN_METRIC", message: "metric must be one of the calculated metric codes" }, { status: 400 })
  }
  const sector = url.searchParams.get("sector")
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC"
  const basis = url.searchParams.get("basis") === "annual" ? "annual" : "latest"

  const rows = (await db.$queryRawUnsafe(
    `SELECT c.id AS companyId, cm.value, cm."fiscalYear", cm."periodLabel", cm."periodType",
            c.ticker, c."nameEn", c."nameAr", c.sector
     FROM CalculatedMetric cm
     JOIN Company c ON c.id = cm.companyId AND c."isActive" = 1
     WHERE cm.code = ? AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL
       AND cm."fiscalYear" >= 2023
       ${sector ? `AND c.sector = ?` : ""}`,
    metric,
    ...(sector ? [sector] : [])
  )) as (RankRow & { periodType: string })[]

  // per company: latest ANNOUNCED interim (basis=latest) or latest ANNUAL.
  // Freshness gate: "latest quarter" must mean the site's current reporting
  // window — only periods within the last 4 quarter-slots of the freshest one
  // qualify, so a company stuck on 2024 data never tops a 2026 leaderboard.
  const withKeys = rows.map((r) => ({ ...r, sortKey: r.fiscalYear * 10 + quarterIndex(r.periodType, r.periodLabel) }))
  const maxKey = withKeys.reduce((m, r) => Math.max(m, r.sortKey), 0)
  const minKey = basis === "latest" ? maxKey - 4 : (Math.floor(maxKey / 10) - 1) * 10 + Math.max(0, maxKey % 10)
  const byCompany = new Map<string, RankRow & { sortKey: number }>()
  for (const r of withKeys) {
    if (basis === "latest" && (r.periodType === "ANNUAL" || r.sortKey < minKey)) continue
    if (basis === "annual" && (r.periodType !== "ANNUAL" || r.sortKey < minKey)) continue
    const prev = byCompany.get(r.companyId)
    if (!prev || r.sortKey > prev.sortKey) byCompany.set(r.companyId, { ...r })
  }
  let results = [...byCompany.values()].sort((a, b) => (order === "ASC" ? a.value - b.value : b.value - a.value))

  const sectors = await db.company.findMany({
    where: { isActive: true },
    select: { sector: true },
    distinct: ["sector"],
    orderBy: { sector: "asc" },
  })

  const def = CALC_METRIC_MAP[metric]
  return Response.json({
    metric: { code: metric, labelEn: def.labelEn, labelAr: def.labelAr, unit: def.unit },
    basis,
    results,
    sectors: sectors.map((s) => s.sector),
    total: results.length,
  })
}
