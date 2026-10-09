import { createHash } from "node:crypto"
import { NextRequest } from "next/server"
import ZAI from "z-ai-web-dev-sdk"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireAuth, unauthorizedResponse } from "@/lib/access"
import { isPremiumUser } from "@/lib/subscription"
import { getClientIp } from "@/lib/rate-limit"
import { canUseSmartAnalysis, getSmartAnalysisUsage, incrementSmartAnalysisUsage } from "@/lib/smart-analysis-usage"
import { EVENT_TYPE_MAP } from "@/lib/financial/registry"
import { reportPeriodKey } from "@/lib/financial/periods"
import { buildRuleBasedAnalysis } from "@/lib/financial/rule-based-analysis"
import {
  TRUSTED_REPORT_STATUSES,
  fetchCalc,
  statementPreference,
} from "@/lib/financial/statement-pref"

// GET  /api/v1/companies/[id]/ai-analysis — latest cached AI analysis (or null)
// POST /api/v1/companies/[id]/ai-analysis — generate a grounded analysis
//
// GROUNDING RULES (the core of this endpoint): the model receives a JSON
// snapshot built EXCLUSIVELY from verified database data — calculated metrics
// (single preferred statement basis, never mixed consolidated/standalone), raw
// normalized values from trusted reports, detected events with their matched
// conditions, and a data-quality section. Nothing is invented server-side
// either: the prompt forbids fabrication, missing data must be called out as
// unavailable. Identical data (same sha256 of the snapshot) is served from the
// AiAnalysis cache without an LLM call.

const SYSTEM_PROMPT =
  "You are a professional equity analyst for Egyptian Exchange (EGX) listed companies. " +
  "You receive a JSON snapshot containing VERIFIED financial data extracted from uploaded " +
  "official financial statements, calculated ratios, and detected events. STRICT RULES: " +
  "(1) Use ONLY numbers present in the provided JSON — never invent, estimate, or fabricate any figure. " +
  "(2) If a metric is missing or marked unavailable, explicitly say it is 'not available' — never treat missing as zero. " +
  "(3) Always cite the period labels you refer to. " +
  "(4) Distinguish quarterly vs annual vs TTM periods — never compare incompatible periods. " +
  "(5) Note the data quality section if validation warnings exist. " +
  "(6) Output clean markdown with sections: Overview, Revenue & Growth, Profitability, " +
  "Balance Sheet & Leverage, Cash Flow, Risks & Unusual Changes, Summary. " +
  "(7) Do not give buy/sell investment advice; this is factual financial analysis."

const AI_TIMEOUT_MS = 90_000
const MAX_PROMPT_PERIODS = 8
const MAX_PROMPT_EVENTS = 8
const MAX_INPUT_SUMMARY_CHARS = 20_000

/** Round every float in the snapshot to 2 decimals to keep the prompt compact */
function roundReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100
  return value
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`AI request timed out after ${ms}ms`)), ms)
    promise.then(
      (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      }
    )
  })
}

function safeParseArray(json: string): unknown[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function aiFailed(message: string): Response {
  return Response.json({ error: "AI_FAILED", message }, { status: 502 })
}

// GET — latest stored analysis for the company (auth + usage-gated)
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth(req as unknown as NextRequest)
  if (!userId) return unauthorizedResponse()

  const isPremium = await isPremiumUser(userId)
  const canAccess = await canUseSmartAnalysis(userId, isPremium)
  if (!canAccess) {
    const usage = await getSmartAnalysisUsage(userId)
    return Response.json(
      { error: "USAGE_LIMIT_EXCEEDED", message: `Free tier limit: ${usage.limit} Smart Analyses per month. ${usage.remaining} remaining. Resets ${usage.resetAt}.`, usage },
      { status: 429 }
    )
  }

  const { id } = await params
  const company = await db.company.findUnique({ where: { id }, select: { id: true } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const latest = await db.aiAnalysis.findFirst({
    where: { companyId: id },
    orderBy: { createdAt: "desc" },
  })

  return Response.json({
    analysis: latest
      ? {
          content: latest.content,
          createdAt: latest.createdAt,
          periodKey: latest.periodKey,
          dataHash: latest.dataHash,
          model: latest.model,
        }
      : null,
  })
}

// In-memory per-IP rate limit for the LLM-spending endpoint. Public by design
// (spec flow has no admin gate) — this caps abuse of the paid generation path.
const globalForRate = globalThis as unknown as {
  __egxAiRate?: Map<string, number[]>
}
const rateBucket = (globalForRate.__egxAiRate ??= new Map<string, number[]>())
const RATE_LIMIT = 10 // generations
const RATE_WINDOW_MS = 10 * 60 * 1000 // per 10 minutes

// POST — generate (or serve cached) grounded analysis
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth(req as unknown as NextRequest)
  if (!userId) return unauthorizedResponse()

  const isPremium = await isPremiumUser(userId)
  const canAccess = await canUseSmartAnalysis(userId, isPremium)
  if (!canAccess) {
    const usage = await getSmartAnalysisUsage(userId)
    return Response.json(
      { error: "USAGE_LIMIT_EXCEEDED", message: `Free tier limit: ${usage.limit} Smart Analyses per month. ${usage.remaining} remaining. Resets ${usage.resetAt}.`, usage },
      { status: 429 }
    )
  }

  await incrementSmartAnalysisUsage(userId)

  const { id } = await params
  const ip = getClientIp(req)
  const now = Date.now()
  const hits = (rateBucket.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  if (hits.length >= RATE_LIMIT) {
    return Response.json(
      { error: "RATE_LIMITED", message: `AI analysis is limited to ${RATE_LIMIT} generations per 10 minutes.` },
      { status: 429, headers: { "Retry-After": String(Math.ceil((RATE_WINDOW_MS - (now - hits[0])) / 1000)) } }
    )
  }
  hits.push(now)
  rateBucket.set(ip, hits)

  const company = await db.company.findUnique({ where: { id } })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { lang?: string }
  const lang = (body.lang ?? new URL(req.url).searchParams.get("lang") ?? "en").toLowerCase()

  // ---------- 1. Verified-data snapshot ----------
  const { pref: calcPref, filtered: calcRows } = await fetchCalc(id)

  const trustedReports = await db.financialReport.findMany({
    where: { companyId: id, processingStatus: { in: [...TRUSTED_REPORT_STATUSES] } },
    select: {
      id: true,
      periodType: true,
      fiscalYear: true,
      periodLabel: true,
      statementType: true,
      processingStatus: true,
      parserVersion: true,
      extractionConfidence: true,
      version: true,
      isRestatement: true,
    },
    orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
  })

  // Per-company statement basis, never mixing consolidated with standalone
  const basis = calcRows.length ? calcPref : statementPreference(trustedReports)
  const basisReportIds = trustedReports.filter((r) => r.statementType === basis).map((r) => r.id)
  const reportKeyById = new Map<string, string>(
    trustedReports
      .filter((r) => r.statementType === basis)
      .map((r) => [r.id, reportPeriodKey(r)] as const)
  )

  const rawValues = basisReportIds.length
    ? await db.financialValue.findMany({
        where: { companyId: id, reportId: { in: basisReportIds }, validationStatus: "VALID" },
        select: { reportId: true, metricCode: true, normalizedValue: true, unit: true },
      })
    : []

  // Period buckets: calculated metrics grouped by periodKey (preferred basis only)
  const periods = new Map<
    string,
    {
      periodKey: string
      periodLabel: string
      periodType: string
      fiscalYear: number
      calculatedMetrics: Record<string, { value: number | null; status: string; detail?: string }>
      rawValues: Record<string, { value: number; unit: string }>
    }
  >()
  for (const m of calcRows) {
    if (!periods.has(m.periodKey)) {
      periods.set(m.periodKey, {
        periodKey: m.periodKey,
        periodLabel: m.periodLabel,
        periodType: m.periodType,
        fiscalYear: m.fiscalYear,
        calculatedMetrics: {},
        rawValues: {},
      })
    }
    const bucket = periods.get(m.periodKey)!
    bucket.calculatedMetrics[m.code] =
      m.valueStatus === "OK" && m.value !== null
        ? { value: m.value, status: "OK" }
        : { value: null, status: m.valueStatus, ...(m.statusDetail ? { detail: m.statusDetail } : {}) }
  }

  // Raw normalized values attached to their report period (grounding data)
  for (const v of rawValues) {
    const key = reportKeyById.get(v.reportId)
    if (!key) continue
    if (!periods.has(key)) {
      const report = trustedReports.find((r) => r.id === v.reportId)!
      periods.set(key, {
        periodKey: key,
        periodLabel: report.periodLabel,
        periodType: report.periodType,
        fiscalYear: report.fiscalYear,
        calculatedMetrics: {},
        rawValues: {},
      })
    }
    const bucket = periods.get(key)!
    bucket.rawValues[v.metricCode] = { value: v.normalizedValue, unit: v.unit }
  }

  // Latest 8 period buckets, most recent first (sort by fiscalYear/period)
  const orderedPeriods = [...periods.values()].sort(
    (a, b) => a.fiscalYear - b.fiscalYear || a.periodKey.localeCompare(b.periodKey)
  )
  const promptPeriods = orderedPeriods.slice(-MAX_PROMPT_PERIODS).reverse()

  // Anchor period: latest annual period key (or null) — orderedPeriods is ascending
  const annualPeriods = orderedPeriods.filter((p) => p.periodType === "ANNUAL")
  const latestAnnualKey = annualPeriods.length ? annualPeriods[annualPeriods.length - 1].periodKey : null

  // Recent detected events (max 8)
  const events = await db.financialEvent.findMany({
    where: { companyId: id },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }],
    take: MAX_PROMPT_EVENTS,
  })

  // Data-quality section for the underlying reports
  const validationRows = basisReportIds.length
    ? await db.financialValidationResult.findMany({
        where: { reportId: { in: basisReportIds } },
        select: { status: true },
      })
    : []
  const validationChecks = {
    failed: validationRows.filter((v) => v.status === "FAILED").length,
    warning: validationRows.filter((v) => v.status === "WARNING").length,
  }
  const manuallyCorrectedValues = basisReportIds.length
    ? await db.financialValue.count({ where: { reportId: { in: basisReportIds }, isManuallyCorrected: true } })
    : 0
  const statusCounts: Record<string, number> = {}
  for (const r of trustedReports.filter((rep) => rep.statementType === basis)) {
    statusCounts[r.processingStatus] = (statusCounts[r.processingStatus] ?? 0) + 1
  }
  const confidences = trustedReports
    .filter((rep) => rep.statementType === basis && rep.extractionConfidence !== null)
    .map((rep) => rep.extractionConfidence as number)

  // ---------- 2. No verified data at all → explicit error, never a fabricated analysis ----------
  const hasData = calcRows.length > 0 || rawValues.length > 0
  if (!hasData) {
    return Response.json(
      {
        error: "NO_DATA",
        message: "No verified financial data available for this company yet. Upload and approve financial statements first.",
      },
      { status: 400 }
    )
  }

  const snapshot = {
    company: {
      ticker: company.ticker,
      name: company.nameEn,
      nameAr: company.nameAr,
      sector: company.sector,
      industry: company.industry,
    },
    statementBasis: basis,
    valueNotes:
      "rawValues are normalized values from trusted reports: plain EGP for monetary metrics, EGP per share for per-share metrics, unscaled counts for share counts.",
    periods: promptPeriods,
    events: events.map((e) => ({
      eventType: e.eventType,
      label: EVENT_TYPE_MAP[e.eventType]?.labelEn ?? e.eventType,
      periodLabel: e.periodLabel,
      periodType: e.periodType,
      explanation: e.explanationEn,
      conditions: safeParseArray(e.conditions),
    })),
    dataQuality: {
      reportsConsidered: basisReportIds.length,
      reportStatuses: statusCounts,
      validationChecks,
      manuallyCorrectedValues,
      avgExtractionConfidence: confidences.length
        ? confidences.reduce((a, b) => a + b, 0) / confidences.length
        : null,
      parserVersions: [...new Set(trustedReports.filter((r) => r.statementType === basis && r.parserVersion).map((r) => r.parserVersion as string))],
    },
  }

  const snapshotJson = JSON.stringify(snapshot, roundReplacer)
  const dataHash = createHash("sha256").update(snapshotJson).digest("hex")

  // ---------- 3. Cache: identical data → identical analysis, no LLM call ----------
  const cached = await db.aiAnalysis.findFirst({
    where: { companyId: id, dataHash },
    orderBy: { createdAt: "desc" },
  })
  if (cached) {
    return Response.json({
      analysis: {
        content: cached.content,
        createdAt: cached.createdAt,
        periodKey: cached.periodKey,
        dataHash: cached.dataHash,
        model: cached.model,
      },
      cached: true,
    })
  }

  // ---------- 4. LLM call (backend only) — falls back to the deterministic
  // rule-based analysis when no LLM is configured/reachable, so the investor
  // always gets a grounded reading instead of an error ----------
  let content: string | undefined
  let model = "glm"
  try {
    const zai = await ZAI.create()
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: "assistant", content: SYSTEM_PROMPT },
          {
            role: "user",
            content:
              "Company data (JSON):\n" +
              snapshotJson +
              (lang === "ar" ? "\n\nاكتب أطروحة استثمار باللغة العربية بهذا الهيكل بالعناوين: ## أطروحة استثمار (٣ جمل تلخص الوضع) ## نقاط القوة ## نقاط الضعف ## الفرص ## المخاطر ## الاتجاه العام (إيجابي بحذر / محايد / سلبي — بدون توصية شراء أو بيع مباشرة). استخدم أرقام البيانات فقط مع ذكر فترة كل رقم." : "\n\nWrite an investment thesis in English with headings: ## Investment Thesis (3 sentences) ## Strengths ## Weaknesses ## Opportunities ## Risks ## Overall Stance (cautiously positive / neutral / negative — no direct buy/sell recommendation). Use only data figures with period labels."),
          },
        ],
        thinking: { type: "disabled" },
      }),
      AI_TIMEOUT_MS
    )
    content = completion?.choices?.[0]?.message?.content
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    content = buildRuleBasedAnalysis(snapshot, lang === "ar" ? "ar" : "en")
    model = "rule-based@1"
    await audit("AI_ANALYSIS", {
      actor: "system",
      entityType: "Company",
      entityId: id,
      details: `LLM unavailable (${message.slice(0, 120)}) — served rule-based analysis`,
    })
  }

  if (!content || !content.trim()) {
    content = buildRuleBasedAnalysis(snapshot, lang === "ar" ? "ar" : "en")
    model = "rule-based@1"
  }

  // ---------- 5. Persist (inputSummary truncated for storage sanity) ----------
  const saved = await db.aiAnalysis.create({
    data: {
      companyId: id,
      periodKey: latestAnnualKey,
      content,
      dataHash,
      inputSummary: snapshotJson.slice(0, MAX_INPUT_SUMMARY_CHARS),
      model,
    },
  })

  await audit("AI_ANALYSIS", {
    actor: "system",
    entityType: "Company",
    entityId: id,
    details: `Grounded AI analysis generated (${basis} basis, snapshot ${dataHash.slice(0, 12)}…, ${promptPeriods.length} periods, ${events.length} events)`,
  })

  return Response.json({
    analysis: {
      content: saved.content,
      createdAt: saved.createdAt,
      periodKey: saved.periodKey,
      dataHash: saved.dataHash,
      model: saved.model,
    },
    cached: false,
  })
}
