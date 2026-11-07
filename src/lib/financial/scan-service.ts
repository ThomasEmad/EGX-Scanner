// Scan service (server-only): builds scan contexts per company for a period basis
// and evaluates stored/custom scanner rules. Every result includes per-condition
// explanations generated from actual stored values.

import { db } from "@/lib/db"
import { parsePeriodKey, periodKeyLabel } from "./periods"
import { evaluateRule, ruleAvailability, validateRuleConditions, type RuleEval, type ScanCondition, type ScanContext } from "./scanner"
import type { PeriodBasis } from "./periods"
import { preferConsolidatedRows, type CalcMetricRow } from "./statement-pref"
import { cached } from "@/lib/server-cache"

// Annotations give the Prisma conditional payload a concrete shape — required
// for preferConsolidatedRows<T> inference (TS cannot infer generics from
// Prisma's GetFindResult conditional types).

export interface CompanyScanResult {
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  isDemoData: boolean
  contextPeriodKey: string | null
  contextPeriodLabel: string | null
  evaluation: RuleEval
}

export interface ScanRunOutput {
  periodBasis: PeriodBasis
  results: CompanyScanResult[]
  matched: CompanyScanResult[]
  availability: Record<string, number>
  validationErrors: string[]
  ranAt: string
}

// Cached market-wide: ~1.4s per basis to build; only changes on recompute
// (invalidated by data-mutating admin endpoints).
export function buildScanContextsCached(basis: PeriodBasis) {
  return cached(`scanContexts:${basis}`, 30 * 60_000, () => buildScanContextsUncached(basis))
}

async function buildScanContextsUncached(basis: PeriodBasis): Promise<
  { company: { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string; isDemoData: boolean }; context: ScanContext; periodKey: string | null }[]
> {
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true },
    orderBy: { ticker: "asc" },
  })

  const wantedType = basis === "LATEST_ANNUAL" ? "ANNUAL" : basis === "LATEST_TTM" ? "TTM" : "QUARTERLY"

  // All period keys per company of the wanted type (from calculated metrics).
  // Statement-type aware: per-company preference (CONSOLIDATED when the company
  // has any consolidated rows, else STANDALONE) — the two bases are never mixed
  // within one company's scan context.
  //
  // Aggregated in SQL on purpose: MAX(periodKey) per (companyId, periodType,
  // statementType). The key format is TYPE:YEAR:SUB, so the lexicographic MAX
  // is exactly the (fiscalYear, sub) recency comparison the JS loop below does,
  // and preferConsolidatedRows only needs companyId/statementType. Pulling
  // EVERY row (493k+ and growing) to do this in JS streamed multi-MB responses
  // per basis — three bases in parallel on the company profile route exhausted
  // the serverless function and 500'd it (~13s) (2026-11-07). ~1.2k aggregated
  // rows come back instead.
  const allTypeRows = await db.$queryRawUnsafe<
    { companyId: string; periodType: string; statementType: string; periodKey: string }[]
  >(
    `SELECT "companyId", "periodType", "statementType", MAX("periodKey") AS "periodKey"
     FROM "CalculatedMetric"
     WHERE "statementType" IN ('CONSOLIDATED','STANDALONE')
     GROUP BY "companyId", "periodType", "statementType"`
  )
  const metrics = preferConsolidatedRows(allTypeRows)

  const latestKeyPerCompany = new Map<string, string>()
  for (const m of metrics) {
    if (m.periodType !== wantedType) continue
    const existing = latestKeyPerCompany.get(m.companyId)
    if (!existing) {
      latestKeyPerCompany.set(m.companyId, m.periodKey)
    } else {
      const cur = parsePeriodKey(m.periodKey)
      const ex = parsePeriodKey(existing)
      if (cur.fiscalYear > ex.fiscalYear || (cur.fiscalYear === ex.fiscalYear && cur.sub > ex.sub)) {
        latestKeyPerCompany.set(m.companyId, m.periodKey)
      }
    }
  }

  const periodKeys = [...new Set(latestKeyPerCompany.values())]

  // Metrics at each company's latest key — fetched in companyId CHUNKS so no
  // single Turso response exceeds ~1MB. The previous single query over all
  // companies (~83k rows, ~9MB) was killed mid-stream by the HTTP layer
  // (UND_ERR_SOCKET "fetch failed") and 500'd the company profile route
  // (2026-11-07); an earlier variant already tripped Turso's server-side
  // response-memory guard (2026-11-06). A chunk is bounded: ~30 companies x
  // their latest-period rows. Chunks (plus the event/dividend fetches) run in
  // parallel; the union is identical data, just never one giant response.
  // Columns id/formulaVersion/calculatedAt are not consumed by scan contexts
  // and are dropped to keep every row light.
  const CHUNK = 30
  const chunkJobs: Promise<CalcMetricRow[]>[] = []
  for (let i = 0; i < companies.length; i += CHUNK) {
    const chunkIds = companies.slice(i, i + CHUNK).map((c) => c.id)
    const chunkKeys = [...new Set(chunkIds.map((id) => latestKeyPerCompany.get(id)).filter((k): k is string => !!k))]
    if (!chunkKeys.length) continue
    chunkJobs.push(
      db.calculatedMetric
        .findMany({
          where: { companyId: { in: chunkIds }, periodKey: { in: chunkKeys }, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
          select: { companyId: true, code: true, periodKey: true, periodType: true, fiscalYear: true, periodLabel: true, value: true, valueStatus: true, statusDetail: true, statementType: true },
        })
        .then((rows) => rows as unknown as CalcMetricRow[])
    )
  }
  const eventRowsP = periodKeys.length
    ? db.financialEvent.findMany({ where: { currentPeriodKey: { in: periodKeys } }, select: { companyId: true, eventType: true, currentPeriodKey: true } })
    : Promise.resolve([] as { companyId: string; eventType: string; currentPeriodKey: string }[])
  const dividendRowsP = db.dividend.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, status: true } })
  const [chunkResults, eventRows, dividendRows] = await Promise.all([Promise.all(chunkJobs), eventRowsP, dividendRowsP])
  const allMetricRows = chunkResults.flat()
  // same per-company statement-type preference as the context keys above
  // (explicit type arg — Prisma conditional payload types defeat generic inference)
  const metricRows = preferConsolidatedRows<CalcMetricRow>(allMetricRows)

  const metricsByCompanyPeriod = new Map<string, Map<string, { value: number | null; valueStatus: string; statusDetail: string | null }>>()
  for (const row of metricRows) {
    const key = `${row.companyId}|${row.periodKey}`
    if (!metricsByCompanyPeriod.has(key)) metricsByCompanyPeriod.set(key, new Map())
    metricsByCompanyPeriod.get(key)!.set(row.code, { value: row.value, valueStatus: row.valueStatus, statusDetail: row.statusDetail })
  }

  const eventsByCompany = new Map<string, Set<string>>()
  for (const row of eventRows) {
    // events qualify ONLY at the company's own scanned period — a turnaround in
    // 2023 must not match a company whose latest period is 2025 (and stale
    // companies' old "latest" keys must not leak history into everyone else)
    if (row.currentPeriodKey !== latestKeyPerCompany.get(row.companyId)) continue
    if (!eventsByCompany.has(row.companyId)) eventsByCompany.set(row.companyId, new Set())
    eventsByCompany.get(row.companyId)!.add(row.eventType)
  }

  const dividendsByCompany = new Map<string, string[]>()
  for (const row of dividendRows) {
    if (!dividendsByCompany.has(row.companyId)) dividendsByCompany.set(row.companyId, [])
    dividendsByCompany.get(row.companyId)!.push(row.status)
  }

  return companies.map((company) => {
    const periodKey = latestKeyPerCompany.get(company.id) ?? null
    const metricMap = periodKey ? metricsByCompanyPeriod.get(`${company.id}|${periodKey}`) : undefined
    const scanMetrics: Record<string, { status: "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"; value?: number; detail?: string }> = {}
    if (metricMap) {
      for (const [code, m] of metricMap.entries()) {
        scanMetrics[code] =
          m.valueStatus === "OK" && m.value !== null
            ? { status: "OK", value: m.value }
            : { status: m.valueStatus as "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE", detail: m.statusDetail ?? "Not available" }
      }
    }
    return {
      company,
      periodKey,
      context: {
        metrics: scanMetrics,
        events: eventsByCompany.get(company.id) ?? new Set<string>(),
        dividendStatuses: dividendsByCompany.get(company.id) ?? [],
        sector: company.sector,
      } satisfies ScanContext,
    }
  })
}

export async function runScan(
  conditions: ScanCondition[],
  basis: PeriodBasis
): Promise<ScanRunOutput> {
  const validation = validateRuleConditions(conditions)
  // Single shared build — concurrent callers (e.g. every preset card) must
  // never each trigger their own full-market fetch (a 10× cache stampede of
  // ~270k-row queries is enough to exhaust memory on small hosts).
  const contexts = await buildScanContextsCached(basis)
  return evaluateAgainstContexts(conditions, basis, contexts, validation)
}

// Evaluate a rule against pre-built scan contexts (no cache involved).
function evaluateAgainstContexts(
  conditions: ScanCondition[],
  basis: PeriodBasis,
  contexts: Awaited<ReturnType<typeof buildScanContextsUncached>>,
  validation?: ReturnType<typeof validateRuleConditions>,
): ScanRunOutput {
  const results: CompanyScanResult[] = contexts.map(({ company, context, periodKey }) => {
    const evaluation = evaluateRule(conditions, context)
    return {
      companyId: company.id,
      ticker: company.ticker,
      nameEn: company.nameEn,
      nameAr: company.nameAr,
      sector: company.sector,
      isDemoData: company.isDemoData,
      contextPeriodKey: periodKey,
      contextPeriodLabel: periodKey ? periodKeyLabel(periodKey) : null,
      evaluation,
    }
  })

  const availability = ruleAvailability(conditions, contexts.map((c) => c.context))
  const matched = results.filter((r) => r.evaluation.matched)

  return {
    periodBasis: basis,
    results,
    matched,
    availability,
    validationErrors: validation ? validation.errors : validateRuleConditions(conditions).errors,
    ranAt: new Date().toISOString(),
  }
}


// Dashboard scanner cards — every preset scanned on the latest annual basis.
// Scan contexts are built ONCE and shared by all presets (the cached build is
// a full-market fetch; per-preset evaluation is pure and cheap).
export async function getPresetScannerCards(): Promise<
  { id: string; presetKey: string | null; name: string; nameAr: string | null; description: string | null; count: number; topMatches: { companyId: string; ticker: string; nameEn: string; nameAr: string | null; period: string | null }[] }[]
> {
  return cached("dashboard:scannerCards", 30 * 60_000, async () => {
    const presets = await db.scannerRule.findMany({ where: { isPreset: true, isActive: true }, orderBy: { createdAt: "asc" } })
    const contexts = await buildScanContextsCached("LATEST_ANNUAL")
    return presets.map((rule) => {
      const output = evaluateAgainstContexts(JSON.parse(rule.conditions) as ScanCondition[], "LATEST_ANNUAL", contexts)
      return {
        id: rule.id,
        presetKey: rule.presetKey,
        name: rule.name,
        nameAr: rule.nameAr,
        description: rule.description,
        count: output.matched.length,
        topMatches: output.matched.slice(0, 4).map((m) => ({
          companyId: m.companyId,
          ticker: m.ticker,
          nameEn: m.nameEn,
          nameAr: m.nameAr,
          period: m.contextPeriodLabel,
        })),
      }
    })
  })
}
