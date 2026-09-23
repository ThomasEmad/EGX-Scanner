"use client"

// Typed API client for the EGX Financial Scanner REST API (/api/v1).

export type MetricResultStatus = "OK" | "DATA_UNAVAILABLE" | "NOT_APPLICABLE" | "NOT_COMPUTABLE"

export interface ConditionEval {
  kind: "metric" | "event" | "dividend"
  code?: string
  eventType?: string
  statuses?: string[]
  operator?: string
  threshold?: number
  labelEn: string
  labelAr: string
  actualDisplay: string
  actualRaw?: number
  status: MetricResultStatus
  note?: string
  matched: boolean
}

export interface CompanyScanResult {
  companyId: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  isDemoData: boolean
  contextPeriodKey: string | null
  contextPeriodLabel: string | null
  evaluation: { matched: boolean; matchedCount: number; conditions: ConditionEval[] }
}

export interface ScanOutput {
  periodBasis: string
  results: CompanyScanResult[]
  matched: CompanyScanResult[]
  availability: Record<string, number>
  validationErrors: string[]
  ruleId?: string | null
  ruleName?: string
}

export interface ScannerRule {
  id: string
  name: string
  nameAr: string | null
  description: string | null
  isPreset: boolean
  presetKey: string | null
  conditions: ScanCondition[]
  createdBy: string
}

export type ScanCondition =
  | { kind: "metric"; code: string; operator: string; value: number }
  | { kind: "event"; eventType: string }
  | { kind: "dividend"; statuses: string[] }

export interface CompanyListItem {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  industry: string | null
  listingStatus: string
  isDemoData: boolean
  counts: { reports: number; events: number; dividends: number }
  snapshot: Record<string, { value: number | null; status: string; periodLabel: string }>
}

export interface CompanyDetail {
  company: {
    id: string
    ticker: string
    nameEn: string
    nameAr: string | null
    sector: string
    industry: string | null
    listingStatus: string
    isDemoData: boolean
    sharesOutstanding: number | null
    descriptionEn: string | null
    descriptionAr: string | null
    counts: { reports: number; events: number; dividends: number; values: number }
  }
  latestPeriods: { annual?: string; quarterly?: string }
  matchedPresets: { presetKey: string; name: string; nameAr: string | null; basis: string }[]
}

export interface EventItem {
  id: string
  eventType: string
  labelEn: string
  labelAr: string
  tone: "positive" | "negative" | "neutral"
  periodLabel: string
  periodType: string
  fiscalYear: number
  currentPeriodKey: string
  previousPeriodKey: string | null
  conditions: { metric: string; current?: number; previous?: number; detail: string; ok: boolean }[]
  explanationEn: string
  explanationAr: string
  ruleVersion: string
  detectedAt: string
}

export interface DividendItem {
  id: string
  companyId?: string
  announcementDate: string | null
  eligibilityDate: string | null
  exDividendDate: string | null
  distributionDate: string | null
  dividendPerShare: number | null
  currency: string
  dividendType: string
  status: string
  sourceName: string
  notes: string | null
  isDemoData?: boolean
  company?: { id: string; ticker: string; nameEn: string; nameAr: string | null; sector?: string; isDemoData?: boolean }
}

export interface DashboardData {
  stats: { companies: number; reports: number; validValues: number; events: number; pendingReview: number; pendingReports: number }
  scannerCards: {
    id: string
    presetKey: string | null
    name: string
    nameAr: string | null
    description: string | null
    count: number
    topMatches: { companyId: string; ticker: string; nameEn: string; nameAr: string | null; period: string | null }[]
  }[]
  recentEvents: {
    id: string
    eventType: string
    periodLabel: string
    explanationEn: string
    explanationAr: string
    company: { id: string; ticker: string; nameEn: string; nameAr: string | null; isDemoData: boolean }
  }[]
  upcomingDividends: DividendItem[]
}

export interface ReportListItem {
  id: string
  companyId?: string
  company?: { ticker: string; nameEn: string; nameAr: string | null }
  reportType: string
  periodType: string
  periodLabel: string
  fiscalYear: number
  periodEnd?: string
  publicationDate?: string | null
  sourceName: string
  processingStatus: string
  extractionMethod: string | null
  fileHash: string | null
  fileSize?: number | null
  version: number
  isRestatement?: boolean
  isDemoData: boolean
  notes: string | null
  valueCount: number
  createdAt?: string
}

export interface FinancialsData {
  periods: { key: string; label: string; periodType: string; fiscalYear: number }[]
  statements: Record<string, { code: string; statementType: string; cells: Record<string, { value: number; unit: string; normalizedValue: number; label: string; reportId: string }> }[]>
}

export interface MetricsData {
  periods: { key: string; label: string; periodType: string; fiscalYear: number }[]
  rows: {
    code: string
    labelEn: string
    labelAr: string
    unit: string
    kind: string
    cells: Record<string, { value: number | null; status: string; detail: string | null; formulaVersion: string }>
  }[]
}

export interface ReviewData {
  values: {
    id: string
    metricCode: string
    originalLabel: string
    value: number
    unit: string
    normalizedValue: number
    currency: string
    sourcePage: number | null
    sourceText: string | null
    extractionMethod: string | null
    confidence: number
    validationNotes: string | null
    company: { ticker: string; nameEn: string; nameAr: string | null }
    report: { id: string; periodLabel: string; periodType: string; processingStatus: string }
    createdAt: string
  }[]
  reports: {
    id: string
    periodLabel: string
    periodType: string
    processingStatus: string
    notes: string | null
    company: { ticker: string; nameEn: string; nameAr: string | null }
    valueCount: number
    fileHash: string | null
    createdAt: string
  }[]
}

export interface MetricRegistry {
  rawMetrics: { code: string; labelEn: string; labelAr: string; statementType: string; aliases: string[] }[]
  calculatedMetrics: { code: string; labelEn: string; labelAr: string; unit: string; kind: string; description?: string }[]
  marketMetrics: { code: string; labelEn: string; labelAr: string; unit: string; kind: string; description?: string }[]
  eventTypes: { type: string; labelEn: string; labelAr: string; tone: string; description: string }[]
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`
    try {
      const body = await res.json()
      message = body.message || body.error || message
      const err = new Error(message) as Error & { status?: number; body?: unknown }
      err.status = res.status
      err.body = body
      throw err
    } catch (e) {
      if ((e as Error).status) throw e
      throw new Error(message)
    }
  }
  return res.json() as Promise<T>
}

function authHeaders(token?: string | null): Record<string, string> {
  return token ? { "x-admin-token": token } : {}
}

export const api = {
  dashboard: () => fetch("/api/v1/dashboard").then((r) => handle<DashboardData>(r)),

  companies: (params: { search?: string; sector?: string; page?: number; pageSize?: number }) => {
    const q = new URLSearchParams()
    if (params.search) q.set("search", params.search)
    if (params.sector) q.set("sector", params.sector)
    q.set("page", String(params.page ?? 1))
    q.set("pageSize", String(params.pageSize ?? 9))
    return fetch(`/api/v1/companies?${q}`).then((r) =>
      handle<{ page: number; pageSize: number; total: number; totalPages: number; companies: CompanyListItem[] }>(r)
    )
  },

  company: (id: string) => fetch(`/api/v1/companies/${id}`).then((r) => handle<CompanyDetail>(r)),

  financials: (id: string) => fetch(`/api/v1/companies/${id}/financials`).then((r) => handle<FinancialsData>(r)),

  metrics: (id: string) => fetch(`/api/v1/companies/${id}/metrics`).then((r) => handle<MetricsData>(r)),

  events: (id: string) =>
    fetch(`/api/v1/companies/${id}/events`).then((r) => handle<{ events: EventItem[] }>(r)),

  companyDividends: (id: string) =>
    fetch(`/api/v1/companies/${id}/dividends`).then((r) => handle<{ dividends: DividendItem[] }>(r)),

  companyReports: (id: string) =>
    fetch(`/api/v1/companies/${id}/reports`).then((r) => handle<{ reports: ReportListItem[] }>(r)),

  scanners: () => fetch(`/api/v1/scanners`).then((r) => handle<{ rules: ScannerRule[] }>(r)),

  createScanner: (body: { name: string; nameAr?: string; description?: string; conditions: ScanCondition[] }) =>
    fetch(`/api/v1/scanners`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<{ rule: ScannerRule }>(r)),

  deleteScanner: (id: string, token?: string | null) =>
    fetch(`/api/v1/scanners/${id}`, { method: "DELETE", headers: authHeaders(token) }).then((r) => handle<{ ok: boolean }>(r)),

  runScanner: (body: { ruleId?: string; conditions?: ScanCondition[]; periodBasis?: string; name?: string }) =>
    fetch(`/api/v1/scanners/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<ScanOutput>(r)),

  dividends: (status?: string) =>
    fetch(`/api/v1/dividends${status ? `?status=${status}` : ""}`).then((r) => handle<{ dividends: DividendItem[] }>(r)),

  registry: () => fetch(`/api/v1/metrics`).then((r) => handle<MetricRegistry>(r)),

  reports: (params: { companyId?: string; status?: string; page?: number }) => {
    const q = new URLSearchParams()
    if (params.companyId) q.set("companyId", params.companyId)
    if (params.status) q.set("status", params.status)
    q.set("page", String(params.page ?? 1))
    q.set("pageSize", "10")
    return fetch(`/api/v1/reports?${q}`).then((r) =>
      handle<{ total: number; totalPages: number; reports: ReportListItem[] }>(r)
    )
  },

  adminLogin: (passcode: string) =>
    fetch(`/api/v1/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).then((r) => handle<{ token: string }>(r)),

  uploadReport: (form: FormData, token: string) =>
    fetch(`/api/v1/reports`, { method: "POST", headers: authHeaders(token), body: form }).then((r) => handle<{ report: { id: string; periodLabel: string; processingStatus: string; fileHash: string } }>(r)),

  processReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/process`, { method: "POST", headers: authHeaders(token) }).then((r) => handle<{ ok: boolean; status: string; message?: string; extractedCount?: number; validCount?: number; needsReviewCount?: number }>(r)),

  approveReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/approve`, { method: "POST", headers: authHeaders(token) }).then((r) => handle<{ ok: boolean }>(r)),

  review: () => fetch(`/api/v1/review`).then((r) => handle<ReviewData>(r)),

  reviewAction: (valueId: string, body: { action: string; value?: number; metricCode?: string; unit?: string }, token: string) =>
    fetch(`/api/v1/review/values/${valueId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    }).then((r) => handle<{ ok: boolean }>(r)),
}
