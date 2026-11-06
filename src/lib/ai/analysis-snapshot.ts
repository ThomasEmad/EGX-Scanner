// AI analysis snapshot builder — assembles the complete grounded context the
// LLM analyst receives. Everything in the snapshot is derived EXCLUSIVELY from
// verified database data:
//   1. calculated metrics (single preferred statement basis, never mixed
//      consolidated/standalone)
//   2. raw normalized values from trusted reports (latest period only — older
//      periods stay compact via their calculated metrics)
//   3. detected financial events with their matched conditions
//   4. deterministic intelligence layers: company scores + sector-relative
//      valuation read, investor signals, and the research-profile analysis
//      modules (earnings quality, cash flow quality, anomalies, …)
//   5. market data (latest price point, trailing-12m dividends)
//
// Nothing is invented server-side: metrics that cannot be computed are marked
// "unavailable", never zero. Pipeline/data-engineering metadata is kept out of
// the snapshot so analyses never surface data-quality documentation to users.
//
// Used by both the analysis generation endpoint and the follow-up chat
// endpoint, so the analyst always reasons over the same verified facts.

import { createHash } from "node:crypto"
import { db } from "@/lib/db"
import { EVENT_TYPE_MAP, CALC_METRIC_MAP } from "@/lib/financial/registry"
import { reportPeriodKey } from "@/lib/financial/periods"
import {
  TRUSTED_REPORT_STATUSES,
  fetchCalc,
  statementPreference,
} from "@/lib/financial/statement-pref"
import { computeCompanyScores, type CompanyScores } from "@/lib/financial/scores"
import { getLatestPrice, sumDps12m } from "@/lib/financial/market"
import { buildResearchProfile } from "@/lib/financial/analysis/research-profile"
import { buildInvestorSignals } from "@/lib/financial/analysis/investor-signals"
import type {
  AnalysisContext,
  AnalysisResult,
  EvidenceStatement,
  PeriodSnapshot,
} from "@/lib/financial/analysis/types"

export const AI_SNAPSHOT_MAX_PERIODS = 8
export const AI_SNAPSHOT_MAX_EVENTS = 8
/** Model label persisted when the deterministic fallback served instead of the LLM */
export const RULE_BASED_MODEL = "rule-based@1"
const MAX_SIGNALS = 36
const MAX_STATEMENTS_PER_MODULE = 3
const MAX_NARRATIVE_CHARS = 320
const MAX_LABEL_CHARS = 120

/** Round every float to 2 decimals to keep the prompt compact and readable. */
export function roundReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100
  return value
}

function clip(text: string | undefined, max: number): string | undefined {
  if (!text) return undefined
  const t = text.trim()
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`
}

function fmtEventConditions(json: string): unknown[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Compact snapshot shapes
// ---------------------------------------------------------------------------

/** numeric when verified OK; "unavailable" when it cannot be computed */
type CompactMetricValue = number | "unavailable"

export interface AiSnapshotBundle {
  hasData: boolean
  snapshotJson: string
  dataHash: string
  latestAnnualKey: string | null
  promptPeriodCount: number
  eventCount: number
  statementBasis: string
  /** periodKey -> { metricCode -> raw normalized value } (latest period only) */
  latestRawValues: Record<string, number>
}

interface CompactSignal {
  dimension: string
  direction: string
  tone: string
  code: string
  label: string
  labelAr?: string
  interpretation: string
  interpretationAr?: string
  magnitude?: number
  confidence?: number
  severity?: string
}

interface CompactStatement {
  label: string
  narrative: string
  narrativeAr?: string
  tone?: string
  confidence?: number
}

interface CompactModule {
  category: string
  title: string
  titleAr?: string
  assessment?: string
  summary: string
  summaryAr?: string
  statements: CompactStatement[]
}

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 }
const TONE_RANK: Record<string, number> = { warning: 0, negative: 1, positive: 2, neutral: 3 }

function compactSignals(signals: ReturnType<typeof buildInvestorSignals>["signals"]): CompactSignal[] {
  const sorted = [...signals].sort((a, b) => {
    const sa = SEVERITY_RANK[a.severity ?? "info"] ?? 2
    const sb = SEVERITY_RANK[b.severity ?? "info"] ?? 2
    if (sa !== sb) return sa - sb
    const ta = TONE_RANK[a.tone] ?? 3
    const tb = TONE_RANK[b.tone] ?? 3
    if (ta !== tb) return ta - tb
    return (b.confidence ?? 0) - (a.confidence ?? 0)
  })
  return sorted.slice(0, MAX_SIGNALS).map((s) => ({
    dimension: s.dimension,
    direction: s.direction,
    tone: s.tone,
    code: s.code,
    label: clip(s.label, MAX_LABEL_CHARS) ?? s.code,
    ...(s.labelAr ? { labelAr: clip(s.labelAr, MAX_LABEL_CHARS) } : {}),
    interpretation: clip(s.interpretation, MAX_NARRATIVE_CHARS) ?? "",
    ...(s.interpretationAr ? { interpretationAr: clip(s.interpretationAr, MAX_NARRATIVE_CHARS) } : {}),
    ...(typeof s.magnitude === "number" && Number.isFinite(s.magnitude)
      ? { magnitude: Math.round(s.magnitude * 100) / 100 }
      : {}),
    ...(typeof s.confidence === "number" ? { confidence: Math.round(s.confidence * 100) / 100 } : {}),
    ...(s.severity && s.severity !== "info" ? { severity: s.severity } : {}),
  }))
}

function compactStatements(statements: EvidenceStatement[]): CompactStatement[] {
  const sorted = [...statements].sort((a, b) => (b.confidence ?? 0.5) - (a.confidence ?? 0.5))
  return sorted.slice(0, MAX_STATEMENTS_PER_MODULE).map((s) => ({
    label: clip(s.label, MAX_LABEL_CHARS) ?? "",
    narrative: clip(s.narrative, MAX_NARRATIVE_CHARS) ?? "",
    ...(s.narrativeAr ? { narrativeAr: clip(s.narrativeAr, MAX_NARRATIVE_CHARS) } : {}),
    ...(s.tone ? { tone: s.tone } : {}),
    ...(typeof s.confidence === "number" ? { confidence: Math.round(s.confidence * 100) / 100 } : {}),
  }))
}

function compactModules(categories: AnalysisResult[]): CompactModule[] {
  return categories
    .map((c) => ({
      category: c.category,
      title: c.title,
      ...(c.titleAr ? { titleAr: c.titleAr } : {}),
      ...(c.assessment ? { assessment: c.assessment } : {}),
      summary: clip(c.summary, MAX_NARRATIVE_CHARS) ?? "",
      ...(c.summaryAr ? { summaryAr: clip(c.summaryAr, MAX_NARRATIVE_CHARS) } : {}),
      statements: compactStatements(c.statements),
    }))
    .filter((m) => m.statements.length > 0 || (m.summary && m.summary.length > 0))
}

function compactScores(scores: CompanyScores | null) {
  if (!scores) return undefined
  const components: Record<string, number | null> = {}
  for (const c of scores.components) components[c.key] = c.score
  const v = scores.valuation
  return {
    overall: scores.overall,
    components,
    ...(v
      ? {
          valuation: {
            price: v.price,
            pe: v.pe,
            pb: v.pb,
            sectorMedianPe: v.sectorMedianPe,
            sectorMedianPb: v.sectorMedianPb,
            peDiscountPct: v.peDiscountPct,
            pbDiscountPct: v.pbDiscountPct,
            verdict: v.verdict,
          },
        }
      : {}),
  }
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export interface AiSnapshotCompany {
  id: string
  ticker: string
  nameEn: string
  nameAr: string | null
  sector: string
  industry: string | null
  sharesOutstanding: number | null
  listingStatus: string
}

export async function buildAiSnapshotBundle(company: AiSnapshotCompany): Promise<AiSnapshotBundle> {
  // ---------- 1. Verified calculated metrics (preferred statement basis) ----------
  const { pref: calcPref, filtered: calcRows } = await fetchCalc(company.id)

  const trustedReports = await db.financialReport.findMany({
    where: {
      companyId: company.id,
      processingStatus: { in: [...TRUSTED_REPORT_STATUSES] },
    },
    select: {
      id: true,
      periodType: true,
      fiscalYear: true,
      periodLabel: true,
      statementType: true,
    },
    orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
  })

  const basis = calcRows.length ? calcPref : statementPreference(trustedReports)
  const basisReportIds = trustedReports.filter((r) => r.statementType === basis).map((r) => r.id)
  const reportKeyById = new Map<string, string>(
    trustedReports
      .filter((r) => r.statementType === basis)
      .map((r) => [r.id, reportPeriodKey(r)] as const)
  )

  const rawValues = basisReportIds.length
    ? await db.financialValue.findMany({
        where: { companyId: company.id, reportId: { in: basisReportIds }, validationStatus: "VALID" },
        select: { reportId: true, metricCode: true, normalizedValue: true, unit: true },
      })
    : []

  // ---------- 2. Period buckets ----------
  interface Bucket {
    periodKey: string
    periodLabel: string
    periodType: string
    fiscalYear: number
    calculatedMetrics: Record<string, CompactMetricValue>
    rawValues: Record<string, number>
  }
  const periods = new Map<string, Bucket>()
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
    // Coherence-guard reasons stay internal; the compact encoding keeps the
    // prompt free of data-pipeline prose.
    bucket.calculatedMetrics[m.code] =
      m.valueStatus === "OK" && m.value !== null && Number.isFinite(m.value)
        ? Math.round(m.value * 100) / 100
        : "unavailable"
  }

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
    periods.get(key)!.rawValues[v.metricCode] = Math.round(v.normalizedValue * 100) / 100
  }

  const orderedPeriods = [...periods.values()].sort(
    (a, b) => a.fiscalYear - b.fiscalYear || a.periodKey.localeCompare(b.periodKey)
  )
  const promptPeriods = orderedPeriods.slice(-AI_SNAPSHOT_MAX_PERIODS).reverse()

  const annualPeriods = orderedPeriods.filter((p) => p.periodType === "ANNUAL")
  const latestAnnualKey = annualPeriods.length
    ? annualPeriods[annualPeriods.length - 1].periodKey
    : null

  const hasData = calcRows.length > 0 || rawValues.length > 0

  // Latest-period raw values only (older periods stay compact via metrics)
  const latestPeriodWithRaw = [...promptPeriods].find((p) => Object.keys(p.rawValues).length > 0)
  const latestRawValues = latestPeriodWithRaw ? latestPeriodWithRaw.rawValues : {}

  // ---------- 3. Events ----------
  const events = await db.financialEvent.findMany({
    where: { companyId: company.id },
    orderBy: [{ fiscalYear: "desc" }, { periodLabel: "desc" }],
    take: AI_SNAPSHOT_MAX_EVENTS,
  })

  // ---------- 4. Market data ----------
  const pricePoint = await getLatestPrice(company.id)
  const dps = pricePoint ? await sumDps12m(company.id, pricePoint.asOf) : { hasRecords: false }
  const dividendYieldPct =
    pricePoint && dps.dps12m !== undefined && pricePoint.price > 0
      ? Math.round((dps.dps12m / pricePoint.price) * 100 * 100) / 100
      : undefined

  const market = pricePoint
    ? {
        price: pricePoint.price,
        priceAsOf: pricePoint.asOf.toISOString(),
        currency: pricePoint.currency,
        dps12m: dps.dps12m,
        dividendYieldPct,
        hasDividendRecords: dps.hasRecords,
        isDemoData: pricePoint.isDemoData || undefined,
      }
    : undefined

  // ---------- 5. Deterministic intelligence layers ----------
  // Built from the same verified raw values (preferred basis only) so every
  // module statement and signal is grounded exactly like the snapshot itself.
  const ctxPeriods: PeriodSnapshot[] = orderedPeriods
    .filter((p) => Object.keys(p.rawValues).length > 0)
    .map((p) => ({
      periodKey: p.periodKey,
      periodType: p.periodType,
      fiscalYear: p.fiscalYear,
      periodLabel: p.periodLabel,
      values: p.rawValues,
    }))

  const ctx: AnalysisContext = {
    companyId: company.id,
    companyTicker: company.ticker,
    companyName: company.nameEn,
    sector: company.sector,
    periods: ctxPeriods,
    anchorPeriodKey: latestAnnualKey ?? ctxPeriods[ctxPeriods.length - 1]?.periodKey,
    marketPrice: pricePoint?.price,
    dps12m: dps.dps12m,
    hasDividendRecords: dps.hasRecords,
  }

  const [scores, profile, signals] = hasData
    ? await Promise.all([
        computeCompanyScores(company.id),
        Promise.resolve(buildResearchProfile(ctx)),
        Promise.resolve(buildInvestorSignals(ctx)),
      ])
    : [null, null, null]

  // Units legend for the codes actually present (once, not per period)
  const units: Record<string, string> = {}
  for (const bucket of promptPeriods) {
    for (const code of Object.keys(bucket.calculatedMetrics)) {
      if (units[code]) continue
      units[code] = CALC_METRIC_MAP[code]?.unit ?? "EGP"
    }
  }

  const snapshot = {
    company: {
      ticker: company.ticker,
      name: company.nameEn,
      nameAr: company.nameAr,
      sector: company.sector,
      industry: company.industry,
      sharesOutstanding: company.sharesOutstanding,
      listingStatus: company.listingStatus,
    },
    statementBasis: basis,
    encodingNotes: [
      "calculatedMetrics: a number means a verified value; the string 'unavailable' means the metric could not be computed (missing or incoherent inputs) — never treat it as zero.",
      "units legend maps metric code -> unit: PERCENT = percentages, RATIO = multipliers (x), EGP = Egyptian pounds, EGP_PER_SHARE = EGP per share.",
      "periods are newest-first; quarterly and annual periods must never be compared directly.",
      "rawValues are the latest period's line items from trusted reports (plain EGP for monetary items, EGP/share for per-share items, unscaled counts for share counts).",
      "signals and modules are deterministic pre-computed readings derived from the same verified values — verify them against the raw numbers, and disagree openly when the numbers do not support them.",
    ],
    ...(units && Object.keys(units).length ? { unitsLegend: units } : {}),
    ...(market ? { market } : {}),
    ...(scores ? { scores: compactScores(scores) } : {}),
    periods: promptPeriods.map((p) => ({
      periodKey: p.periodKey,
      periodLabel: p.periodLabel,
      periodType: p.periodType,
      fiscalYear: p.fiscalYear,
      calculatedMetrics: p.calculatedMetrics,
      ...(p === latestPeriodWithRaw ? { rawValues: p.rawValues } : {}),
    })),
    events: events.map((e) => ({
      eventType: e.eventType,
      label: EVENT_TYPE_MAP[e.eventType]?.labelEn ?? e.eventType,
      periodLabel: e.periodLabel,
      periodType: e.periodType,
      explanation: e.explanationEn,
      conditions: fmtEventConditions(e.conditions),
    })),
    ...(signals ? { signals: compactSignals(signals.signals) } : {}),
    ...(profile ? { modules: compactModules(profile.categories) } : {}),
  }

  const snapshotJson = JSON.stringify(snapshot, roundReplacer)
  const dataHash = createHash("sha256").update(snapshotJson).digest("hex")

  return {
    hasData,
    snapshotJson,
    dataHash,
    latestAnnualKey,
    promptPeriodCount: promptPeriods.length,
    eventCount: events.length,
    statementBasis: basis,
    latestRawValues,
  }
}
