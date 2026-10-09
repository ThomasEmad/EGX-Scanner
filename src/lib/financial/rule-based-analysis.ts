// Rule-based analysis builder — a deterministic, grounded narrative generated
// exclusively from the verified-data snapshot (same input the LLM receives).
// Used as the fallback when no LLM is configured/reachable, so investors always
// get a real, data-grounded reading instead of an error. Every figure comes
// from the snapshot; anything missing is reported as not available — never
// estimated. Output is clearly labeled rule-based (model "rule-based@1").

export interface AnalysisPeriod {
  periodKey: string
  periodLabel: string
  periodType: string
  fiscalYear: number
  calculatedMetrics: Record<string, { value: number | null; status: string; detail?: string }>
  rawValues?: Record<string, { value: number; unit: string }>
}

export interface AnalysisEvent {
  eventType: string
  label: string
  periodLabel: string
}

export interface AnalysisSnapshot {
  company: { ticker: string; name: string; nameAr?: string | null; sector: string; industry?: string | null }
  statementBasis: string
  periods: AnalysisPeriod[]
  events: AnalysisEvent[]
  dataQuality: {
    reportsConsidered: number
    validationChecks: { failed: number; warning: number }
    manuallyCorrectedValues: number
    avgExtractionConfidence: number | null
  }
}

type Lang = "en" | "ar"

const FORMATTERS: Record<string, (v: number) => string> = {
  PERCENT: (v) => `${v.toFixed(1)}%`,
  RATIO: (v) => `${v.toFixed(2)}x`,
  EGP_PER_SHARE: (v) => `EGP ${v.toFixed(2)}`,
  EGP: (v) => {
    const abs = Math.abs(v)
    const sign = v < 0 ? "-" : ""
    if (abs >= 1e9) return `${sign}EGP ${(abs / 1e9).toFixed(2)}B`
    if (abs >= 1e6) return `${sign}EGP ${(abs / 1e6).toFixed(1)}M`
    return `${sign}EGP ${abs.toFixed(0)}`
  },
}

// metric code -> [en label, ar label, unit]
const METRICS: Record<string, [string, string, string]> = {
  revenue: ["Revenue", "الإيرادات", "EGP"],
  revenue_growth: ["Revenue growth (YoY)", "نمو الإيرادات (سنويًا)", "PERCENT"],
  net_profit: ["Net profit", "صافي الربح", "EGP"],
  profit_growth: ["Profit growth (YoY)", "نمو صافي الربح (سنويًا)", "PERCENT"],
  net_margin: ["Net margin", "هامش صافي الربح", "PERCENT"],
  gross_margin: ["Gross margin", "هامش الربح الإجمالي", "PERCENT"],
  roe: ["Return on equity", "العائد على حقوق الملكية", "PERCENT"],
  roa: ["Return on assets", "العائد على الأصول", "PERCENT"],
  debt_to_equity: ["Debt / equity", "الدين إلى حقوق الملكية", "RATIO"],
  current_ratio: ["Current ratio", "نسبة التداول", "RATIO"],
  eps: ["EPS", "ربحية السهم", "EGP_PER_SHARE"],
  book_value_per_share: ["Book value per share", "القيمة الدفترية للسهم", "EGP_PER_SHARE"],
  operating_cash_flow: ["Operating cash flow", "التدفق النقدي التشغيلي", "EGP"],
  ocf_growth: ["Operating cash flow growth", "نمو التدفق التشغيلي", "PERCENT"],
  total_assets: ["Total assets", "إجمالي الأصول", "EGP"],
  total_equity: ["Shareholders' equity", "حقوق المساهمين", "EGP"],
  total_debt: ["Total debt", "إجمالي الدين", "EGP"],
  market_cap: ["Market capitalization", "القيمة السوقية", "EGP"],
  p_e: ["P/E", "مكرر الربحية", "RATIO"],
  p_b: ["P/B", "السعر إلى القيمة الدفترية", "RATIO"],
}

function fmt(code: string, value: number | null | undefined, lang: Lang): string {
  if (value === null || value === undefined) return lang === "ar" ? "غير متاح" : "not available"
  const unit = METRICS[code]?.[2] ?? "EGP"
  const fn = FORMATTERS[unit] ?? FORMATTERS.EGP
  return fn(value)
}

/** Latest-OK value of a metric code in a period bucket */
function pick(period: AnalysisPeriod | undefined, code: string): { value: number | null; status: string } | null {
  const m = period?.calculatedMetrics?.[code]
  if (!m) return null
  return m
}

export function buildRuleBasedAnalysis(snapshot: AnalysisSnapshot, lang: Lang): string {
  const ar = lang === "ar"
  const periodsAsc = [...snapshot.periods].sort((a, b) => a.fiscalYear - b.fiscalYear || a.periodKey.localeCompare(b.periodKey))
  const annuals = periodsAsc.filter((p) => p.periodType === "ANNUAL")
  const latest = annuals[annuals.length - 1] ?? periodsAsc[periodsAsc.length - 1]
  const previous = annuals.length >= 2 ? annuals[annuals.length - 2] : undefined
  if (!latest) {
    return ar ? "لا توجد فترات موثقة كافية للتحليل." : "No verified periods available for analysis."
  }

  const L = (en: string, arText: string) => (ar ? arText : en)
  const name = ar && snapshot.company.nameAr ? snapshot.company.nameAr : snapshot.company.name
  const out: string[] = []

  out.push(
    ar
      ? `> **تحليل قائم على القواعد** — مبني حصريًا على البيانات الموثقة في قاعدة البيانات (بدون نموذج لغوي). كل الأرقام من الفترات المعتمدة؛ المفقود يُذكر كـ«غير متاح».`
      : `> **Rule-based analysis** — built exclusively from verified database data (no language model). All figures come from approved periods; anything missing is stated as not available.`
  )
  out.push("")
  out.push(`## ${L("Overview", "نظرة عامة")}`)
  out.push(
    ar
      ? `${name} (${snapshot.company.ticker}) — قطاع ${snapshot.company.sector}. أساس التحليل: ${snapshot.statementBasis}. أحدث فترة سنوية موثقة: ${latest.periodLabel}.`
      : `${name} (${snapshot.company.ticker}) — ${snapshot.company.sector} sector. Basis: ${snapshot.statementBasis}. Latest verified annual period: ${latest.periodLabel}.`
  )

  const section = (titleEn: string, titleAr: string, codes: string[]) => {
    const lines: string[] = []
    for (const code of codes) {
      const [en, arLabel] = METRICS[code] ?? [code, code]
      const cur = pick(latest, code)
      const prev = previous ? pick(previous, code) : null
      if (!cur) continue
      const curText =
        cur.status === "OK" && cur.value !== null
          ? fmt(code, cur.value, lang)
          : ar
            ? "غير متاح"
            : "not available"
      let line = ar ? `- **${arLabel}**: ${curText}` : `- **${en}**: ${curText}`
      if (prev && prev.status === "OK" && prev.value !== null && cur.status === "OK" && cur.value !== null) {
        line += ar ? ` (السنة السابقة ${previous!.periodLabel}: ${fmt(code, prev.value, lang)})` : ` (previous ${previous!.periodLabel}: ${fmt(code, prev.value, lang)})`
      }
      lines.push(line)
    }
    if (lines.length) {
      out.push("")
      out.push(`## ${ar ? titleAr : titleEn}`)
      out.push(...lines)
    }
  }

  section("Revenue & Growth", "الإيرادات والنمو", ["revenue", "revenue_growth", "net_profit", "profit_growth"])
  section("Profitability", "الربحية", ["gross_margin", "net_margin", "roe", "roa"])
  section("Balance Sheet & Leverage", "الميزانية والرفع المالي", ["total_assets", "total_equity", "total_debt", "debt_to_equity", "current_ratio"])
  section("Cash Flow", "التدفقات النقدية", ["operating_cash_flow", "ocf_growth"])
  section("Per-share & Market", "قيم السهم والسوق", ["eps", "book_value_per_share", "market_cap", "p_e", "p_b"])

  if (snapshot.events.length) {
    out.push("")
    out.push(`## ${L("Detected events", "الأحداث المكتشفة")}`)
    for (const e of snapshot.events.slice(0, 6)) {
      out.push(`- ${e.label} — ${e.periodLabel}`)
    }
  }

  const dq = snapshot.dataQuality
  out.push("")
  out.push(`## ${L("Data quality", "جودة البيانات")}`)
  out.push(
    ar
      ? `- تقارير موثقة مدروسة: ${dq.reportsConsidered} · فحوصات فاشلة: ${dq.validationChecks.failed} · تحذيرات: ${dq.validationChecks.warning}`
      : `- Trusted reports considered: ${dq.reportsConsidered} · failed checks: ${dq.validationChecks.failed} · warnings: ${dq.validationChecks.warning}`
  )

  return out.join("\n")
}
