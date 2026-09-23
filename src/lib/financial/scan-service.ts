// Scan service (server-only): builds scan contexts per company for a period basis
// and evaluates stored/custom scanner rules. Every result includes per-condition
// explanations generated from actual stored values.

import { db } from "@/lib/db"
import { parsePeriodKey, periodKeyLabel } from "./periods"
import { evaluateRule, ruleAvailability, validateRuleConditions, type PeriodBasis, type RuleEval, type ScanCondition, type ScanContext } from "./scanner"

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

export async function buildScanContexts(basis: PeriodBasis): Promise<
  { company: { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string; isDemoData: boolean }; context: ScanContext; periodKey: string | null }[]
> {
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true, isDemoData: true },
    orderBy: { ticker: "asc" },
  })

  const wantedType = basis === "LATEST_ANNUAL" ? "ANNUAL" : "QUARTERLY"

  // All period keys per company of the wanted type (from calculated metrics)
  const metrics = await db.calculatedMetric.findMany({
    where: { companyId: { in: companies.map((c) => c.id) } },
    select: { companyId: true, periodKey: true, periodType: true, fiscalYear: true },
  })

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
  const [metricRows, eventRows, dividendRows] = await Promise.all([
    periodKeys.length
      ? db.calculatedMetric.findMany({ where: { periodKey: { in: periodKeys } } })
      : Promise.resolve([]),
    periodKeys.length
      ? db.financialEvent.findMany({ where: { currentPeriodKey: { in: periodKeys } }, select: { companyId: true, eventType: true, currentPeriodKey: true } })
      : Promise.resolve([]),
    db.dividend.findMany({ where: { companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, status: true } }),
  ])

  const metricsByCompanyPeriod = new Map<string, Map<string, { value: number | null; valueStatus: string; statusDetail: string | null }>>()
  for (const row of metricRows) {
    const key = `${row.companyId}|${row.periodKey}`
    if (!metricsByCompanyPeriod.has(key)) metricsByCompanyPeriod.set(key, new Map())
    metricsByCompanyPeriod.get(key)!.set(row.code, { value: row.value, valueStatus: row.valueStatus, statusDetail: row.statusDetail })
  }

  const eventsByCompany = new Map<string, Set<string>>()
  for (const row of eventRows) {
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
      } satisfies ScanContext,
    }
  })
}

export async function runScan(
  conditions: ScanCondition[],
  basis: PeriodBasis
): Promise<ScanRunOutput> {
  const validation = validateRuleConditions(conditions)
  const contexts = await buildScanContexts(basis)

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
    validationErrors: validation.errors,
    ranAt: new Date().toISOString(),
  }
}
