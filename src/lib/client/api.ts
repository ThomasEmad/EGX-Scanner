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
  latestPeriods: { annual?: string; quarterly?: string; ttm?: string }
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
  statementType?: string
  language?: string
  sourceName: string
  processingStatus: string
  extractionMethod: string | null
  parserVersion?: string | null
  extractionConfidence?: number | null
  errorMessage?: string | null
  uploadedBy?: string | null
  supersedesId?: string | null
  fileHash: string | null
  fileSize?: number | null
  localFileRef?: string | null
  version: number
  isRestatement?: boolean
  isDemoData: boolean
  notes: string | null
  valueCount: number
  createdAt?: string
}

export interface FinancialsData {
  statementType?: "CONSOLIDATED" | "STANDALONE" | null
  availableStatementTypes?: string[]
  periods: { key: string; label: string; periodType: string; fiscalYear: number }[]
  statements: Record<string, { code: string; statementType: string; cells: Record<string, { value: number; unit: string; normalizedValue: number; label: string; reportId: string }> }[]>
}

export interface MetricsData {
  statementType?: "CONSOLIDATED" | "STANDALONE"
  availableStatementTypes?: string[]
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

// ---- Financial document pipeline (upload → extract → validate → review) ----

export interface AnalyzeDetection {
  fileName: string
  fileSize: number
  fileHash: string
  documentKind: string
  pageCount?: number
  looksScanned?: boolean
  engine?: string
  language: string
  statementType: string
  reportUnit?: string
  period: {
    periodType: string
    fiscalYear: number
    periodLabel: string
    sub: string
    periodStart: string | null
    periodEnd: string | null
    confidence: number
  } | null
  candidateCount: number
  candidateCodes: string[]
  warnings: string[]
}

export interface AnalyzeResult {
  ok: boolean
  detection: AnalyzeDetection
  error?: string
  message?: string
}

export interface ValidationCheckRow {
  id?: string
  checkName: string
  category: string
  status: "PASSED" | "WARNING" | "FAILED" | "SKIPPED"
  severity: "INFO" | "WARNING" | "CRITICAL"
  details: string | null
  createdAt?: string
}

export interface ExtractionLogRow {
  id?: string
  stage: string
  level: string
  message: string
  details: string | null
  createdAt?: string
}

export interface ReportValueRow {
  id: string
  metricCode: string
  originalLabel: string
  value: number
  unit: string
  currency: string
  normalizedValue: number
  statementType: string
  sourcePage: number | null
  sourceText: string | null
  extractionMethod: string | null
  confidence: number
  validationStatus: string
  validationNotes: string | null
  isManuallyCorrected: boolean
  originalValue: number | null
  correctedBy: string | null
  correctedAt: string | null
  correctionReason: string | null
  createdAt?: string
}

export interface ReportDetail {
  report: {
    id: string
    company: { id: string; ticker: string; nameEn: string; nameAr: string | null }
    companyId: string
    reportType: string
    periodType: string
    periodLabel: string
    fiscalYear: number
    periodStart: string | null
    periodEnd: string | null
    publicationDate: string | null
    statementType: string
    language: string
    sourceName: string
    sourceUrl: string | null
    fileName: string | null
    fileHash: string | null
    fileSize: number | null
    processingStatus: string
    extractionMethod: string | null
    parserVersion: string | null
    extractionConfidence: number | null
    errorMessage: string | null
    version: number
    isRestatement: boolean
    supersedesId: string | null
    isDemoData: boolean
    notes: string | null
    createdAt: string
    updatedAt: string
    uploadedBy?: string | null
    reviewedBy?: string | null
    reviewedAt?: string | null
    approvedBy?: string | null
    approvedAt?: string | null
    validationResults?: ValidationCheckRow[]
    extractionLogs?: ExtractionLogRow[]
    values: ReportValueRow[]
  }
}

export interface ProcessResult {
  ok: boolean
  status: string
  message?: string
  extractedCount?: number
  validCount?: number
  needsReviewCount?: number
  failedCount?: number
  confidence?: number | null
  language?: string
  statementType?: string
  checks?: { checkName: string; status: string; severity: string }[]
  notes?: string | null
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

function authHeaders(token?: string | null): Record<string, string> {
  const headers: Record<string, string> = {}
  if (token) headers["x-admin-token"] = token
  if (typeof window !== "undefined") {
    const userToken = localStorage.getItem("egx-user-token")
    if (userToken) headers["x-session-token"] = userToken
  }
  return headers
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

  financials: (id: string, statementType?: string) =>
    fetch(`/api/v1/companies/${id}/financials${statementType ? `?statementType=${statementType}` : ""}`).then((r) => handle<FinancialsData>(r)),

  metrics: (id: string, statementType?: string) =>
    fetch(`/api/v1/companies/${id}/metrics${statementType ? `?statementType=${statementType}` : ""}`).then((r) => handle<MetricsData>(r)),

  companyDocuments: (id: string) =>
    fetch(`/api/v1/companies/${id}/documents`).then((r) => handle<{ documents: CompanyDocument[] }>(r)),

  aiAnalysis: (id: string) =>
    fetch(`/api/v1/companies/${id}/ai-analysis`).then((r) => handle<AiAnalysisData>(r)),

  generateAiAnalysis: (id: string, lang: string, token?: string | null) =>
    fetch(`/api/v1/companies/${id}/ai-analysis`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ lang }),
    }).then((r) => handle<AiAnalysisData & { cached?: boolean }>(r)),

  events: (id: string) =>
    fetch(`/api/v1/companies/${id}/events`).then((r) => handle<{ events: EventItem[] }>(r)),

  companyDividends: (id: string) =>
    fetch(`/api/v1/companies/${id}/dividends`).then((r) => handle<{ dividends: DividendItem[] }>(r)),

  companyReports: (id: string) =>
    fetch(`/api/v1/companies/${id}/reports`).then((r) => handle<{ reports: ReportListItem[] }>(r)),

  peers: (id: string) => fetch(`/api/v1/companies/${id}/peers`).then((r) => handle<PeerData>(r)),

  eventsFeed: (companyIds?: string[], limit = 15) => {
    const q = new URLSearchParams()
    if (companyIds && companyIds.length) q.set("companyIds", companyIds.join(","))
    q.set("limit", String(limit))
    return fetch(`/api/v1/events?${q}`).then((r) => handle<{ events: EventFeedItem[] }>(r))
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

  analyzeReport: (file: File, token: string) => {
    const form = new FormData()
    form.set("file", file)
    return fetch(`/api/v1/reports/analyze`, { method: "POST", headers: authHeaders(token), body: form }).then((r) =>
      handle<AnalyzeResult>(r)
    )
  },

  uploadReport: (form: FormData, token: string) =>
    fetch(`/api/v1/reports`, { method: "POST", headers: authHeaders(token), body: form }).then((r) =>
      handle<{ report: { id: string; periodLabel: string; processingStatus: string; fileHash: string; statementType?: string; language?: string; version?: number }; superseded?: boolean; version?: number }>(r)
    ),

  reportDetail: (id: string, token?: string | null) =>
    fetch(`/api/v1/reports/${id}`, { headers: authHeaders(token) }).then((r) => handle<ReportDetail>(r)),

  processReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/process`, { method: "POST", headers: authHeaders(token) }).then((r) => handle<ProcessResult>(r)),

  approveReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/approve`, { method: "POST", headers: authHeaders(token) }).then((r) => handle<{ ok: boolean }>(r)),

  rejectReport: (id: string, reason: string, token: string) =>
    fetch(`/api/v1/reports/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify({ reason }),
    }).then((r) => handle<{ ok: boolean; status: string }>(r)),

  downloadReportUrl: (id: string) => `/api/v1/reports/${id}/download`,

  reprocessReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/reprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
    }).then((r) => handle<{ ok: boolean; id: string; processingStatus: string }>(r)),

  deleteReport: (id: string, token: string) =>
    fetch(`/api/v1/reports/${id}/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
    }).then((r) => handle<{ ok: boolean; id: string; processingStatus: string }>(r)),

  review: () => fetch(`/api/v1/review`).then((r) => handle<ReviewData>(r)),

  subscription: () => fetch("/api/v1/subscription/me").then((r) => handle<{ isPremium: boolean; subscription: unknown }>(r)),

  createPaymentRequest: (body: { planId: string; amount: number; paymentMethod?: string; transactionReference?: string | null }) =>
    fetch("/api/v1/payment-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => handle<{ id: string; status: string; createdAt: string }>(r)),

  myPaymentRequests: () => fetch("/api/v1/payment-requests/me").then((r) => handle<{ requests: unknown[] }>(r)),

  adminSubscriptions: () =>
    fetch("/api/v1/admin/subscriptions").then((r) => handle<{ subscriptions: unknown[] }>(r)),

  adminPaymentRequests: () =>
    fetch("/api/v1/admin/payment-requests").then((r) => handle<{ requests: unknown[] }>(r)),

  reviewAction: (valueId: string, body: { action: string; value?: number; metricCode?: string; unit?: string; reason?: string }, token: string) =>
    fetch(`/api/v1/review/values/${valueId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(body),
    }).then((r) => handle<{ ok: boolean }>(r)),
}
