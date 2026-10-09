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
  counts: { events: number; dividends: number }
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
  latestPeriods: { annual?: string; quarterly?: string; ttm?: string }
  /** freshness: latest trusted filing period-end ("data as of" display) */
  dataAsOf?: { periodEnd: string; periodLabel: string } | null
  matchedPresets: { presetKey: string; name: string; nameAr: string | null; basis: string }[]
  marketPrice: { price: number; asOf: string; currency: string; sourceName: string; isDemoData: boolean } | null
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
  conditions: { metric: string; current?: number; previous?: number; detail: string; detailAr?: string; ok: boolean }[]
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
  stats: { companies: number; reports: number; validValues: number; events: number }
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

export interface EventFeedItem {
  id: string
  eventType: string
  labelEn: string
  labelAr: string
  tone: "positive" | "negative" | "neutral"
  periodLabel: string
  periodType: string
  explanationEn: string
  explanationAr: string
  ruleVersion: string
  detectedAt: string
  company: { id: string; ticker: string; nameEn: string; nameAr: string | null; isDemoData: boolean }
}

export interface FinancialsData {
  statementType?: "CONSOLIDATED" | "STANDALONE" | null
  availableStatementTypes?: string[]
  periodView?: "annual" | "interim" | null
  availablePeriodViews?: ("annual" | "interim")[]
  anomalyCount?: number
  periods: { key: string; label: string; periodType: string; fiscalYear: number }[]
  statements: Record<string, { code: string; statementType: string; cells: Record<string, { value: number; unit: string; normalizedValue: number; label: string; reportId: string; flags?: { yoyPct?: number; badSign?: boolean; zero?: boolean; identityFailed?: boolean } }> }[]>
}

export interface MetricsData {
  statementType?: "CONSOLIDATED" | "STANDALONE"
  availableStatementTypes?: string[]
  periodView?: "annual" | "interim" | null
  availablePeriodViews?: ("annual" | "interim")[]
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

export interface CompanyDocument {
  id: string
  periodLabel: string
  periodType: string
  fiscalYear: number
  statementType: string
  language: string
  processingStatus: string
  extractionConfidence: number | null
  parserVersion: string | null
  version: number
  isRestatement: boolean
  fileName: string | null
  fileSize: number | null
  fileHash: string | null
  sourceUrl: string | null
  approvedAt: string | null
  createdAt: string
  hasFile: boolean
  valueCount: number
}

export interface AiAnalysisData {
  analysis: {
    content: string
    createdAt: string
    periodKey: string | null
    dataHash: string
    model: string | null
  } | null
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

export interface PeerData {
  sector: string
  basis: string
  /** true when the sector has fewer than 3 listed companies — peers/medians are empty then */
  insufficient?: boolean
  sectorCount?: number
  period: { key: string; label: string } | null
  medians: Record<string, number | null>
  peers: {
    id: string
    ticker: string
    nameEn: string
    nameAr: string | null
    sector: string
    isDemoData: boolean
    isSelf: boolean
    values: Record<string, number | null>
  }[]
}

export interface RunHistoryItem {
  id: string
  ruleId: string | null
  ruleName: string
  isPreset: boolean
  periodBasis: string
  matchedCount: number
  matchedCompanyIds: string[]
  ranAt: string
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
      if (typeof e === "object" && e !== null && "status" in e) throw e
      throw new Error(message)
    }
  }
  return res.json() as Promise<T>
}

export function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {}
  const userToken = getUserToken()
  if (userToken) headers["x-session-token"] = userToken
  return headers
}

/** Session token, honoring "remember me": localStorage (persistent) or sessionStorage (tab-only) */
export function getUserToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem("egx-user-token") ?? sessionStorage.getItem("egx-user-token")
}

export function setUserToken(token: string, remember: boolean): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem("egx-user-token")
  localStorage.removeItem("egx-user-token")
  if (remember) localStorage.setItem("egx-user-token", token)
  else sessionStorage.setItem("egx-user-token", token)
  // mirror into a cookie so server components (report page) can resolve the session
  document.cookie = `egx-user-token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}

export function clearUserToken(): void {
  if (typeof window === "undefined") return
  sessionStorage.removeItem("egx-user-token")
  localStorage.removeItem("egx-user-token")
  document.cookie = "egx-user-token=; path=/; max-age=0; samesite=lax"
}

/** Build a query string from defined params (skips undefined/empty values) */
function qs(params: Record<string, string | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v) q.set(k, v)
  }
  const s = q.toString()
  return s ? s : ""
}

export const api = {
  dashboard: () => fetch("/api/v1/dashboard", { headers: authHeaders() }).then((r) => handle<DashboardData>(r)),

  latestResults: () =>
    fetch("/api/v1/dashboard/latest-results").then((r) =>
      handle<{
        results: {
          companyId: string; ticker: string; name: string; nameEn: string
          periodLabel: string; periodType: string; fiscalYear: number
          asOf: string; source: string; netProfit: number
        }[]
      }>(r)
    ),

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

  financials: (id: string, statementType?: string, periodView?: string) =>
    fetch(`/api/v1/companies/${id}/financials?${qs({ statementType, period_view: periodView })}`).then((r) => handle<FinancialsData>(r)),

  metrics: (id: string, statementType?: string, periodView?: string) =>
    fetch(`/api/v1/companies/${id}/metrics?${qs({ statementType, period_view: periodView })}`).then((r) => handle<MetricsData>(r)),

  downloadReportUrl: (id: string) => `/api/v1/reports/${id}/download`,

  companyDocuments: (id: string) =>
    fetch(`/api/v1/companies/${id}/documents`).then((r) => handle<{ documents: CompanyDocument[] }>(r)),

  aiAnalysis: (id: string) =>
    fetch(`/api/v1/companies/${id}/ai-analysis`, { headers: authHeaders() }).then((r) => handle<AiAnalysisData>(r)),

  generateAiAnalysis: (id: string, lang: string, token?: string | null) =>
    fetch(`/api/v1/companies/${id}/ai-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ lang }),
    }).then((r) => handle<AiAnalysisData & { cached?: boolean }>(r)),

  events: (id: string) =>
    fetch(`/api/v1/companies/${id}/events`, { headers: authHeaders() }).then((r) => handle<{ events: EventItem[] }>(r)),

  companyDividends: (id: string) =>
    fetch(`/api/v1/companies/${id}/dividends`).then((r) => handle<{ dividends: DividendItem[] }>(r)),

  peers: (id: string) => fetch(`/api/v1/companies/${id}/peers`).then((r) => handle<PeerData>(r)),

  eventsFeed: (companyIds?: string[], limit = 15) => {
    const q = new URLSearchParams()
    if (companyIds && companyIds.length) q.set("companyIds", companyIds.join(","))
    q.set("limit", String(limit))
    return fetch(`/api/v1/events?${q}`, { headers: authHeaders() }).then((r) => handle<{ events: EventFeedItem[] }>(r))
  },

  scanHistory: () =>
    fetch(`/api/v1/scanners/history`).then((r) => handle<{ runs: RunHistoryItem[] }>(r)),

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
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handle<ScanOutput>(r)),

  dividends: (status?: string) =>
    fetch(`/api/v1/dividends${status ? `?status=${status}` : ""}`).then((r) => handle<{ dividends: DividendItem[] }>(r)),

  registry: () => fetch(`/api/v1/metrics`).then((r) => handle<MetricRegistry>(r)),

  adminLogin: (passcode: string) =>
    fetch(`/api/v1/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    }).then((r) => handle<{ token: string }>(r)),

  subscription: () => fetch("/api/v1/subscription/me", { headers: authHeaders() }).then((r) => handle<{ isPremium: boolean; subscription: { id: string; status: string; planName: string; startDate: string | null; endDate: string | null; activatedAt: string | null; activatedBy: string | null; cancelledAt: string | null; notes: string | null } | null; smartAnalysisUsage: { year: number; month: number; usageCount: number; remaining: number; limit: number; resetAt: string | null } }>(r)),

  requestSubscription: (notes?: string) =>
    fetch("/api/v1/subscription/request", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ notes }),
    }).then((r) => handle<{ success: boolean; status: string }>(r)),

  createPaymentRequest: (body: { planId: string; amount: number; paymentMethod?: string; transactionReference?: string | null }) =>
    fetch("/api/v1/payment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handle<{ id: string; status: string; createdAt: string }>(r)),

  myPaymentRequests: () => fetch("/api/v1/payment-requests", { headers: authHeaders() }).then((r) => handle<{ requests: unknown[] }>(r)),

  adminSubscriptions: () =>
    fetch("/api/v1/admin/subscriptions").then((r) => handle<{ subscriptions: unknown[] }>(r)),

  adminPaymentRequests: () =>
    fetch("/api/v1/admin/payment-requests").then((r) => handle<{ requests: unknown[] }>(r)),

  reviewAction: (valueId: string, body: { action: string; value?: number; metricCode?: string; unit?: string; reason?: string }) =>
    fetch(`/api/v1/review/values/${valueId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }).then((r) => handle<{ ok: boolean }>(r)),
}
