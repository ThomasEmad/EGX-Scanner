// Data-completeness service (server-only, read-only).
//
// Produces a field-level inventory and gap analysis from the live database.
// It deliberately distinguishes:
//   - verified values (VALID + authoritative per integrity-policy)
//   - quarantined values (NEEDS_REVIEW / FAILED / carried-forward / zero placeholders)
//   - missing values (no record at all)
//   - not-applicable fields (sector-specific denominators)
// and never converts missing data to zero.
//
// The same service powers `scripts/data-completeness-audit.ts` and the
// `/api/v1/data-quality/completeness` monitoring endpoint.

import { db } from "@/lib/db"
import { isAuthoritativeValue } from "@/lib/financial/integrity-policy"
import { isFuturePeriodEnd } from "@/lib/financial/period-validity"
import { TRUSTED_REPORT_STATUSES, preferConsolidatedRows } from "@/lib/financial/statement-pref"

export interface Coverage {
  numerator: number
  denominator: number
  pct: number | null
}

export interface MetricCoverageRow {
  code: string
  labelEn: string
  statementType: string
  appliesToSectors: string[] | null
  applicableCompanies: number
  companiesWithAny: number
  companiesWithLatestAnnual: number
  anyCoverage: Coverage
  latestAnnualCoverage: Coverage
  valuesTotal: number
  valuesValid: number
  valuesNeedsReview: number
  valuesFailed: number
  valuesPending: number
}

export interface CompanyGap {
  ticker: string
  nameEn: string
  sector: string
  latestPeriod: string | null
  latestPeriodEnd: string | null
  latestAnnualPeriod: string | null
  latestAnnualEnd: string | null
  ageDays: number | null
  missingApplicableMetrics: string[]
  hasPrice: boolean
  latestPriceDate: string | null
  priceAgeDays: number | null
}

export interface CompletenessReport {
  generatedAt: string
  universe: {
    companiesTotal: number
    companiesActive: number
    companiesInactive: number
    sectors: Record<string, number>
  }
  metadata: {
    isin: Coverage
    sharesOutstanding: Coverage
    website: Coverage
    egxCategory: Coverage
    sourceUrl: Coverage
    irUrl: Coverage
    lastVerifiedAt: Coverage
    missingIsinTickers: string[]
    missingSharesTickers: string[]
  }
  reports: {
    totalRows: number
    trustedNonDeleted: number
    deleted: number
    future: number
    byPeriodType: Record<string, number>
    byProcessingStatus: Record<string, number>
    byStatementType: Record<string, number>
    annualCompanies: number
    companiesWithAnyTrusted: number
    companiesWithNoTrusted: string[]
    companiesWithNoAnnual: string[]
    latestAnnualFyDistribution: Record<string, number>
    publicationDateCoverage: Coverage
    sourceUrlCoverage: Coverage
  }
  values: {
    total: number
    valid: number
    needsReview: number
    failed: number
    pending: number
    authoritative: number
    quarantined: number
    provenancePageTextCoverage: Coverage
    extractionMethodCoverage: Coverage
  }
  fieldCoverage: MetricCoverageRow[]
  freshness: {
    marketFreshestPeriodEnd: string | null
    companiesWithLatestPeriod: number
    companiesStaleOver365Days: number
    staleCompanies: CompanyGap[]
    companiesWithNoAnnual: string[]
  }
  marketData: {
    totalObservations: number
    companiesWithPrice: number
    companiesWithoutPrice: number
    freshWithin7Days: number
    staleOver7Days: number
    demoObservations: number
    sources: Record<string, number>
    missingPriceTickers: string[]
    stalePriceTickers: string[]
  }
  calculations: {
    totalRows: number
    okRows: number
    unavailableRows: number
    notApplicableRows: number
    notComputableRows: number
    topCodes: Array<{ code: string; companies: number; okRows: number; rows: number }>
  }
  conflicts: {
    needsReviewValues: number
    failedValues: number
    auditRunId: string | null
    auditStartedAt: string | null
    auditSeverity: Record<string, number>
    auditCategories: Record<string, number>
  }
  gaps: {
    companiesWithNoTrusted: string[]
    companiesWithNoAnnual: string[]
    companiesMissingAnyApplicableMetric: number
    companiesMissingCoreMetrics: CompanyGap[]
    missingIsinCount: number
    missingPriceCount: number
    stalePriceCount: number
    stalePeriodCount: number
  }
}

const CORE_METRICS = ["NET_PROFIT", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"] as const

const NON_FINANCIAL_METRICS = [
  "REVENUE", "COGS", "GROSS_PROFIT", "OPERATING_INCOME",
  "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "OPERATING_CASH_FLOW",
] as const

const FINANCIAL_METRICS = [
  "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "OPERATING_CASH_FLOW",
] as const

const BANK_METRICS = [
  "NET_INTEREST_INCOME", "NET_PROFIT", "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY",
  "LOANS_TO_CUSTOMERS", "CUSTOMER_DEPOSITS", "OPERATING_CASH_FLOW",
] as const

export function applicableMetricsFor(sector: string): string[] {
  if (sector === "Banks") return [...BANK_METRICS]
  if (["Insurance", "Financial Services", "Investment"].includes(sector)) return [...FINANCIAL_METRICS]
  return [...NON_FINANCIAL_METRICS]
}

export function coverage(numerator: number, denominator: number): Coverage {
  return {
    numerator,
    denominator,
    pct: denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : null,
  }
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / 86_400_000)
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null
}

function parseSectors(json: string | null | undefined): string[] | null {
  if (!json) return null
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) && v.length > 0 ? v.map(String) : null
  } catch {
    return null
  }
}

interface ValueRow {
  metricCode: string
  normalizedValue: number
  validationStatus: string
  validationNotes: string | null
  originalLabel: string | null
  sourcePage: number | null
  sourceText: string | null
  sourceBbox: string | null
  extractionMethod: string
}

interface ReportRow {
  id: string
  companyId: string
  periodType: string
  periodLabel: string
  fiscalYear: number
  periodEnd: Date
  statementType: string
  processingStatus: string
  sourceUrl: string | null
  publicationDate: Date | null
  values: ValueRow[]
}

export async function computeCompletenessReport(now = new Date()): Promise<CompletenessReport> {
  const companies = await db.company.findMany({
    where: { isActive: true },
    select: {
      id: true, ticker: true, nameEn: true, sector: true, isin: true,
      sharesOutstanding: true, website: true, egxCategory: true, sourceUrl: true,
      irUrl: true, lastVerifiedAt: true,
    },
    orderBy: { ticker: "asc" },
  })
  const companyIds = companies.map((c) => c.id)
  const companyById = new Map(companies.map((c) => [c.id, c]))

  const sectors: Record<string, number> = {}
  for (const c of companies) sectors[c.sector] = (sectors[c.sector] ?? 0) + 1

  const totalCompanyRows = await db.company.count()
  const allReports = await db.financialReport.findMany({
    where: { companyId: { in: companyIds } },
    select: {
      id: true, companyId: true, periodType: true, periodLabel: true, fiscalYear: true,
      periodEnd: true, statementType: true, processingStatus: true, sourceUrl: true,
      publicationDate: true, deletedAt: true,
      values: {
        select: {
          metricCode: true, normalizedValue: true, validationStatus: true,
          validationNotes: true, originalLabel: true, sourcePage: true,
          sourceText: true, sourceBbox: true, extractionMethod: true,
        },
      },
    },
  })

  const trusted = allReports.filter(
    (r) =>
      !r.deletedAt &&
      TRUSTED_REPORT_STATUSES.includes(r.processingStatus as (typeof TRUSTED_REPORT_STATUSES)[number]) &&
      !isFuturePeriodEnd(r.periodEnd, now),
  ) as unknown as ReportRow[]

  const byPeriodType: Record<string, number> = {}
  const byProcessingStatus: Record<string, number> = {}
  const byStatementType: Record<string, number> = {}
  for (const r of allReports) {
    byPeriodType[r.periodType] = (byPeriodType[r.periodType] ?? 0) + 1
    byProcessingStatus[r.processingStatus] = (byProcessingStatus[r.processingStatus] ?? 0) + 1
    byStatementType[r.statementType] = (byStatementType[r.statementType] ?? 0) + 1
  }

  // Report-level preference: consolidated when a company has any consolidated
  // report, otherwise standalone. Never mix the two within one company.
  const preferredReports = preferConsolidatedRows(
    trusted.map((r) => ({ ...r, statementType: r.statementType }))
  ) as unknown as ReportRow[]

  const reportsByCompany = new Map<string, ReportRow[]>()
  for (const r of preferredReports) {
    if (!r.values.some(isAuthoritativeValue)) continue
    if (!reportsByCompany.has(r.companyId)) reportsByCompany.set(r.companyId, [])
    reportsByCompany.get(r.companyId)!.push(r)
  }

  // ---- value status / provenance (all trusted reports, not only preferred) ----
  let valuesTotal = 0, valid = 0, needsReview = 0, failed = 0, pending = 0
  let authoritative = 0, quarantined = 0
  let provenanceCount = 0, extractionCount = 0
  for (const r of trusted) {
    for (const v of r.values) {
      valuesTotal++
      if (v.validationStatus === "VALID") valid++
      else if (v.validationStatus === "NEEDS_REVIEW") needsReview++
      else if (v.validationStatus === "FAILED") failed++
      else pending++
      if (isAuthoritativeValue(v)) authoritative++
      else quarantined++
      if (v.sourcePage !== null || v.sourceText !== null || v.sourceBbox !== null) provenanceCount++
      if (v.extractionMethod) extractionCount++
    }
  }

  // ---- latest annual + latest period per company ----
  const latestAnnual = new Map<string, ReportRow>()
  const latestPeriod = new Map<string, ReportRow>()
  // Latest annual report that actually contains each metric. A company's most
  // recent annual filing can be a one-line profit announcement (FY2026 net
  // profit only) while its full balance sheet is in FY2025. Coverage must use
  // the latest available value PER METRIC, not the newest report overall.
  const latestAnnualMetric = new Map<string, Map<string, ReportRow>>()
  for (const [companyId, reports] of reportsByCompany) {
    const annuals = reports.filter((r) => r.periodType === "ANNUAL")
    annuals.sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime() || b.fiscalYear - a.fiscalYear)
    if (annuals[0]) latestAnnual.set(companyId, annuals[0])
    const perMetric = new Map<string, ReportRow>()
    for (const r of annuals) {
      for (const v of r.values) {
        if (isAuthoritativeValue(v) && !perMetric.has(v.metricCode)) perMetric.set(v.metricCode, r)
      }
    }
    latestAnnualMetric.set(companyId, perMetric)
    const latest = [...reports].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0]
    if (latest) latestPeriod.set(companyId, latest)
  }

  const latestAnnualFyDistribution: Record<string, number> = {}
  for (const r of latestAnnual.values()) {
    const k = String(r.fiscalYear)
    latestAnnualFyDistribution[k] = (latestAnnualFyDistribution[k] ?? 0) + 1
  }

  // ---- field-level inventory ----
  const definitions = await db.metricDefinition.findMany({
    where: { isActive: true },
    select: { code: true, labelEn: true, statementType: true, appliesToSectors: true },
    orderBy: [{ statementType: "asc" }, { code: "asc" }],
  })

  const anyByCompany = new Map<string, Set<string>>()
  const metricStats = new Map<string, { total: number; valid: number; review: number; failed: number; pending: number }>()

  for (const [companyId, reports] of reportsByCompany) {
    const any = new Set<string>()
    for (const r of reports) for (const v of r.values) if (isAuthoritativeValue(v)) any.add(v.metricCode)
    anyByCompany.set(companyId, any)
  }
  for (const r of trusted) {
    for (const v of r.values) {
      if (!metricStats.has(v.metricCode)) metricStats.set(v.metricCode, { total: 0, valid: 0, review: 0, failed: 0, pending: 0 })
      const s = metricStats.get(v.metricCode)!
      s.total++
      if (v.validationStatus === "VALID") s.valid++
      else if (v.validationStatus === "NEEDS_REVIEW") s.review++
      else if (v.validationStatus === "FAILED") s.failed++
      else s.pending++
    }
  }

  const fieldCoverage: MetricCoverageRow[] = definitions.map((d) => {
    const applicableSectors = parseSectors(d.appliesToSectors)
    const applicableCompanies = applicableSectors
      ? companies.filter((c) => applicableSectors.includes(c.sector)).length
      : companies.length
    let any = 0, annual = 0
    for (const c of companies) {
      if (applicableSectors && !applicableSectors.includes(c.sector)) continue
      if (anyByCompany.get(c.id)?.has(d.code)) any++
      if (latestAnnualMetric.get(c.id)?.has(d.code)) annual++
    }
    const s = metricStats.get(d.code) ?? { total: 0, valid: 0, review: 0, failed: 0, pending: 0 }
    return {
      code: d.code,
      labelEn: d.labelEn,
      statementType: d.statementType,
      appliesToSectors: applicableSectors,
      applicableCompanies,
      companiesWithAny: any,
      companiesWithLatestAnnual: annual,
      anyCoverage: coverage(any, applicableCompanies),
      latestAnnualCoverage: coverage(annual, applicableCompanies),
      valuesTotal: s.total,
      valuesValid: s.valid,
      valuesNeedsReview: s.review,
      valuesFailed: s.failed,
      valuesPending: s.pending,
    }
  })

  // ---- freshness / company gaps ----
  const freshest = [...latestPeriod.values()].sort((a, b) => b.periodEnd.getTime() - a.periodEnd.getTime())[0]
  const companiesWithNoTrusted = companies.filter((c) => !reportsByCompany.has(c.id)).map((c) => c.ticker)
  const companiesWithNoAnnual = companies.filter((c) => !latestAnnual.has(c.id)).map((c) => c.ticker)

  const prices = await db.marketPrice.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, asOf: true, sourceName: true, isDemoData: true },
    orderBy: { asOf: "desc" },
  })
  const latestPrice = new Map<string, { asOf: Date; sourceName: string; isDemoData: boolean }>()
  for (const p of prices) if (!latestPrice.has(p.companyId)) latestPrice.set(p.companyId, p)

  const staleCompanies: CompanyGap[] = []
  const companiesMissingCoreMetrics: CompanyGap[] = []
  let missingAnyApplicable = 0
  for (const c of companies) {
    const latest = latestPeriod.get(c.id) ?? null
    const annual = latestAnnual.get(c.id) ?? null
    const ageDays = latest ? daysBetween(now, latest.periodEnd) : null
    const price = latestPrice.get(c.id) ?? null
    const priceAgeDays = price ? daysBetween(now, price.asOf) : null
    const applicable = applicableMetricsFor(c.sector)
    // "Missing" means no authoritative value in ANY period, not "absent from
    // the newest one-line annual announcement". Latest-annual coverage is
    // reported separately per metric.
    const present = anyByCompany.get(c.id) ?? new Set<string>()
    const missingApplicableMetrics = applicable.filter((m) => !present.has(m))
    if (missingApplicableMetrics.length > 0) missingAnyApplicable++

    const gap: CompanyGap = {
      ticker: c.ticker,
      nameEn: c.nameEn,
      sector: c.sector,
      latestPeriod: latest?.periodLabel ?? null,
      latestPeriodEnd: iso(latest?.periodEnd),
      latestAnnualPeriod: annual?.periodLabel ?? null,
      latestAnnualEnd: iso(annual?.periodEnd),
      ageDays,
      missingApplicableMetrics,
      hasPrice: Boolean(price),
      latestPriceDate: iso(price?.asOf),
      priceAgeDays,
    }
    if (ageDays !== null && ageDays > 365) staleCompanies.push(gap)
    if (missingApplicableMetrics.some((m) => (CORE_METRICS as readonly string[]).includes(m))) {
      companiesMissingCoreMetrics.push(gap)
    }
  }
  staleCompanies.sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0))
  companiesMissingCoreMetrics.sort((a, b) => b.missingApplicableMetrics.length - a.missingApplicableMetrics.length)

  // ---- market data ----
  let freshWithin7Days = 0, staleOver7Days = 0, demoObservations = 0
  const sources: Record<string, number> = {}
  for (const p of prices) {
    if (p.isDemoData) demoObservations++
    sources[p.sourceName] = (sources[p.sourceName] ?? 0) + 1
  }
  const missingPriceTickers: string[] = []
  const stalePriceTickers: string[] = []
  for (const c of companies) {
    const p = latestPrice.get(c.id)
    if (!p) { missingPriceTickers.push(c.ticker); continue }
    const age = daysBetween(now, p.asOf)
    if (age <= 7) freshWithin7Days++
    else { staleOver7Days++; stalePriceTickers.push(c.ticker) }
  }

  // ---- calculations ----
  const calcRows = await db.$queryRawUnsafe<Array<{ code: string; companies: bigint | number; okRows: bigint | number; rows: bigint | number }>>(
    `SELECT code, COUNT(DISTINCT companyId) AS companies,
            SUM(CASE WHEN valueStatus = 'OK' THEN 1 ELSE 0 END) AS okRows,
            COUNT(*) AS rows
       FROM CalculatedMetric
      WHERE companyId IN (${companyIds.map(() => "?").join(",")})
      GROUP BY code
      ORDER BY companies DESC, code ASC`,
    ...companyIds,
  )
  const calcStatus = await db.calculatedMetric.groupBy({
    by: ["valueStatus"],
    where: { companyId: { in: companyIds } },
    _count: { _all: true },
  })
  const calcStatusMap = Object.fromEntries(calcStatus.map((r) => [r.valueStatus, r._count._all]))
  const calcTotal = Object.values(calcStatusMap).reduce((a, b) => a + b, 0)

  // ---- conflicts / latest audit ----
  const auditRun = await db.auditRun.findFirst({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  })
  const auditSeverity: Record<string, number> = {}
  const auditCategories: Record<string, number> = {}
  if (auditRun) {
    const sev = await db.auditIssue.groupBy({ by: ["severity"], where: { auditRunId: auditRun.id }, _count: { _all: true } })
    for (const s of sev) auditSeverity[s.severity] = s._count._all
    const cats = await db.auditIssue.groupBy({ by: ["category"], where: { auditRunId: auditRun.id }, _count: { _all: true } })
    for (const c of cats) auditCategories[c.category] = c._count._all
  }

  // ---- metadata coverage ----
  const meta = (field: "isin" | "sharesOutstanding" | "website" | "egxCategory" | "sourceUrl" | "irUrl" | "lastVerifiedAt") =>
    coverage(companies.filter((c) => c[field] !== null && c[field] !== undefined && c[field] !== "").length, companies.length)

  const publicationDateCoverage = coverage(trusted.filter((r) => r.publicationDate !== null).length, trusted.length)
  const sourceUrlCoverage = coverage(trusted.filter((r) => Boolean(r.sourceUrl)).length, trusted.length)

  return {
    generatedAt: now.toISOString(),
    universe: {
      companiesTotal: totalCompanyRows,
      companiesActive: companies.length,
      companiesInactive: totalCompanyRows - companies.length,
      sectors,
    },
    metadata: {
      isin: meta("isin"),
      sharesOutstanding: meta("sharesOutstanding"),
      website: meta("website"),
      egxCategory: meta("egxCategory"),
      sourceUrl: meta("sourceUrl"),
      irUrl: meta("irUrl"),
      lastVerifiedAt: meta("lastVerifiedAt"),
      missingIsinTickers: companies.filter((c) => !c.isin).map((c) => c.ticker),
      missingSharesTickers: companies.filter((c) => c.sharesOutstanding === null).map((c) => c.ticker),
    },
    reports: {
      totalRows: allReports.length,
      trustedNonDeleted: trusted.length,
      deleted: allReports.filter((r) => r.deletedAt !== null).length,
      future: allReports.filter((r) => isFuturePeriodEnd(r.periodEnd, now)).length,
      byPeriodType,
      byProcessingStatus,
      byStatementType,
      annualCompanies: latestAnnual.size,
      companiesWithAnyTrusted: reportsByCompany.size,
      companiesWithNoTrusted,
      companiesWithNoAnnual,
      latestAnnualFyDistribution,
      publicationDateCoverage,
      sourceUrlCoverage,
    },
    values: {
      total: valuesTotal,
      valid,
      needsReview,
      failed,
      pending,
      authoritative,
      quarantined,
      provenancePageTextCoverage: coverage(provenanceCount, valuesTotal),
      extractionMethodCoverage: coverage(extractionCount, valuesTotal),
    },
    fieldCoverage,
    freshness: {
      marketFreshestPeriodEnd: iso(freshest?.periodEnd),
      companiesWithLatestPeriod: latestPeriod.size,
      companiesStaleOver365Days: staleCompanies.length,
      staleCompanies: staleCompanies.slice(0, 100),
      companiesWithNoAnnual,
    },
    marketData: {
      totalObservations: prices.length,
      companiesWithPrice: companies.length - missingPriceTickers.length,
      companiesWithoutPrice: missingPriceTickers.length,
      freshWithin7Days,
      staleOver7Days,
      demoObservations,
      sources,
      missingPriceTickers,
      stalePriceTickers: stalePriceTickers.slice(0, 100),
    },
    calculations: {
      totalRows: calcTotal,
      okRows: calcStatusMap.OK ?? 0,
      unavailableRows: calcStatusMap.DATA_UNAVAILABLE ?? 0,
      notApplicableRows: calcStatusMap.NOT_APPLICABLE ?? 0,
      notComputableRows: calcStatusMap.NOT_COMPUTABLE ?? 0,
      topCodes: calcRows.slice(0, 40).map((r) => ({
        code: r.code,
        companies: Number(r.companies),
        okRows: Number(r.okRows),
        rows: Number(r.rows),
      })),
    },
    conflicts: {
      needsReviewValues: needsReview,
      failedValues: failed,
      auditRunId: auditRun?.id ?? null,
      auditStartedAt: auditRun?.startedAt.toISOString() ?? null,
      auditSeverity,
      auditCategories,
    },
    gaps: {
      companiesWithNoTrusted,
      companiesWithNoAnnual,
      companiesMissingAnyApplicableMetric: missingAnyApplicable,
      companiesMissingCoreMetrics: companiesMissingCoreMetrics.slice(0, 100),
      missingIsinCount: companies.filter((c) => !c.isin).length,
      missingPriceCount: missingPriceTickers.length,
      stalePriceCount: stalePriceTickers.length,
      stalePeriodCount: staleCompanies.length,
    },
  }
}
