import { db } from "@/lib/db"
import { gatherCompanyAnalytics } from "@/lib/analytics/gather"
import { computeCompanyScores } from "@/lib/financial/scores"
import { CALC_METRIC_MAP, EVENT_TYPE_MAP } from "@/lib/financial/registry"
import { formatEgp } from "@/lib/financial/units"

// Grounded Q&A engine — answers come ONLY from verified DB values with source
// attribution. No LLM, no speculation: when data is missing the engine says so.
// This is the platform differentiator vs extraction-only competitors: every
// figure traces back to a trusted filing or market snapshot.

export interface QaFigure {
  label: string
  value: string
  detail?: string
}

export interface QaAnswer {
  intent: string
  companyId: string | null
  ticker: string | null
  answer: string
  figures: QaFigure[]
  followUps: string[]
}

type Lang = "ar" | "en"

const has = (q: string, words: readonly string[]) => words.some((w) => q.includes(w))

const INTENT_WORDS = {
  revenue: ["إيراد", "ايراد", "مبيعات", "ريون", "revenue", "sales", " turnover "],
  profit: ["ربح", "خسار", "أرباح", "ارباح", "profit", "loss", "earnings"],
  margin: ["هامش", "margin"],
  roe: ["roe", "عائد على حقوق", "عائد حقوق"],
  roa: ["roa", "عائد على الأصول", "عائد على اصول", "عائد الأصول"],
  valuation: ["مكرر", "p/e", "p e", "pe ", "تقييم", "عادله", "عادل", "fair", "valuation", "undervalu", "مقيمه", "p/b", "دفتريه", "دفترية"],
  health: ["صح", "قوه", "قوة مالية", "health", "score", "درجه ماليه", "درجة مالية"],
  growth: ["نمو", "ينمو", "growth", "تطور"],
  dividend: ["توزيع", "توزيعات", "توزيحات", "dividend", "yield"],
  events: ["حدث", "أحداث", "احداث", "event", "what happened", "ماذا حدث", "جديد"],
  price: ["سعر", "السعر", "price", "سهم بيتباع", "كم بسعر"],
  debt: ["دين", "ديون", "مديونيه", "مديونية", "debt", "استدان", "التزامات"],
  liquidity: ["سيوله", "سيولة", "liquidity", "current ratio", "نسبة التداول"],
  shares: ["عدد الاسهم", "عدد الأسهم", "shares outstanding", "اسهم قائمه", "أسهم قائمة"],
  peers: ["مقارن", "منافس", "peers", "compare", "مقابل", "نفس القطاع", "أقران"],
  sectorBest: ["افضل", "أفضل", "احسن", "أحسن", "best", "top", "أعلى", "اعلى", "ترتيب", "ranking", "rank"],
  summary: ["تحليل", "ملخص", "عن شركة", "عن الشركة", "اخبرني", "أخبرني", "about", "summary", "overview", "رايك", "what do you think", "إيه راي", "ايه راي"],
} as const

const METRIC_BY_HINT: { hint: keyof typeof INTENT_WORDS; code: string }[] = [
  { hint: "revenue", code: "revenue" },
  { hint: "profit", code: "net_profit" },
  { hint: "margin", code: "net_margin" },
  { hint: "roe", code: "roe" },
  { hint: "roa", code: "roa" },
  { hint: "debt", code: "debt_to_equity" },
  { hint: "liquidity", code: "current_ratio" },
]

function detectLang(q: string): Lang {
  return /[\u0600-\u06FF]/.test(q) ? "ar" : "en"
}

// Arabic matching normalizes hamza/ya/ta-marbuta variants so "صحتها"/"الصحة"/"صحيحة"
// all hit the same keyword — SQLite `contains` alone is byte-exact and misses them.
export function normalizeAr(s: string): string {
  return s
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ|ى/g, "ي")
    .replace(/ة/g, "ه")
    .toLowerCase()
}

function detectIntent(rawQ: string): { intent: string; metricCode?: string } {
  const q = normalizeAr(rawQ)
  if (has(q, INTENT_WORDS.sectorBest)) return { intent: "sectorBest", metricCode: metricForRank(q) }
  if (has(q, INTENT_WORDS.valuation)) return { intent: "valuation" }
  if (has(q, INTENT_WORDS.health)) return { intent: "health" }
  if (has(q, INTENT_WORDS.events)) return { intent: "events" }
  if (has(q, INTENT_WORDS.dividend)) return { intent: "dividend" }
  if (has(q, INTENT_WORDS.price)) return { intent: "price" }
  if (has(q, INTENT_WORDS.peers)) return { intent: "peers" }
  if (has(q, INTENT_WORDS.shares)) return { intent: "shares" }
  for (const m of METRIC_BY_HINT) {
    if (has(q, INTENT_WORDS[m.hint])) return { intent: "metric", metricCode: m.code }
  }
  if (has(q, INTENT_WORDS.growth)) return { intent: "growth" }
  if (has(q, INTENT_WORDS.summary)) return { intent: "summary" }
  return { intent: "summary" }
}

// "أفضل شركات البنوك حسب ROE" → sector word + metric word in one question
const RANK_METRICS = [
  { code: "roe", words: ["roe", "عائد على حقوق", "عائد حقوق", "العائد على"] },
  { code: "net_margin", words: ["هامش", "margin"] },
  { code: "revenue_growth", words: ["نمو الايراد", "نمو الإيراد", "نمو الإيرادات", "نمو المبيعات", "revenue growth"] },
  { code: "profit_growth", words: ["نمو الربح", "نمو صافي", "profit growth"] },
  { code: "p_e", words: ["p/e", "مكرر", "المكرر"] },
  { code: "p_b", words: ["p/b", "دفتريه", "دفترية"] },
  { code: "dividend_yield", words: ["توزيع", "عائد التوزيع", "yield"] },
  { code: "net_profit", words: ["ربح", "أرباح", "ارباح"] },
  { code: "revenue", words: ["إيراد", "ايراد", "مبيعات"] },
  { code: "market_cap", words: ["القيمة السوقية", "market cap", "الاكبر", "الأكبر", "اكبر"] },
] as const

function metricForRank(q: string): string {
  for (const m of RANK_METRICS) if (has(q, [...m.words])) return m.code
  return "roe"
}

const SECTOR_WORDS: { sector: string; words: string[] }[] = [
  { sector: "Banks", words: ["بنوك", "البنوك", "bank"] },
  { sector: "Financial Services", words: ["خدمات ماليه", "خدمات مالية", "financial"] },
  { sector: "Healthcare", words: ["دواء", "صحه", "صحة", "طب", "healthcare", "pharma"] },
  { sector: "Food", words: ["اغذيه", "أغذية", "طعام", "food", "غذائيه", "غذائية"] },
  { sector: "Consumer", words: ["استهلاك", "consumer"] },
  { sector: "Industrial", words: ["صناع", "صناعي", "industrial"] },
  { sector: "Telecom", words: ["اتصال", "telecom", "تكنولوج", "technology"] },
  { sector: "Real Estate", words: ["عقار", "عقارات", "real estate"] },
  { sector: "Investment", words: ["استثمار", "investment"] },
  { sector: "Construction", words: ["بناء", "إنشاء", "construction"] },
  { sector: "Basic Materials", words: ["أسمنت", "اسمنت", "صلب", "كيميا", "مواد", "materials", "أسمدة", "اسمدة"] },
  { sector: "Energy", words: ["طاقه", "طاقة", "بترول", "energy", "غاز"] },
  { sector: "Utilities", words: ["مرافق", "utilities", "كهرباء"] },
]

function detectSector(rawQ: string): string | null {
  const q = normalizeAr(rawQ)
  for (const s of SECTOR_WORDS) if (has(q, s.words)) return s.sector
  return null
}

const SECTOR_AR: Record<string, string> = {
  Banks: "البنوك", "Financial Services": "الخدمات المالية", Healthcare: "الرعاية الصحية", Food: "الأغذية",
  Consumer: "المستهلك", Industrial: "الصناعة", Telecom: "الاتصالات والتكنولوجيا", "Real Estate": "العقارات",
  Investment: "الاستثمار", Construction: "الإنشاءات", "Basic Materials": "المواد الأساسية", Energy: "الطاقة",
  Utilities: "المرافق",
}

// ————— company resolution —————
const GENERIC_NAME_WORDS = new Set(["بنك", "شركه", "شركات", "bank", "company", "co", "the"])

async function resolveCompany(question: string, explicitId?: string | null) {
  if (explicitId) {
    const c = await db.company.findUnique({ where: { id: explicitId }, select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true } })
    if (c) return c
  }
  const tickerMatch = question.toUpperCase().match(/\b([A-Z]{3,6})\b/)
  if (tickerMatch) {
    const c = await db.company.findFirst({ where: { ticker: tickerMatch[1], isActive: true }, select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true } })
    if (c) return c
  }
  // Name resolution happens in memory over normalized names — SQLite `contains`
  // is byte-exact (misses hamza/ya/ta-marbuta variants) and findFirst order once
  // preferred "إم إم جروب للصناعة" over "مصر لصناعة الأسمدة" for token "لصناعة".
  const cleaned = question.replace(/[؟?!.,]/g, " ").trim()
  const all = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
  })
  const phrase = normalizeAr(cleaned)
  const phraseHit = all.find(
    (co) => normalizeAr(co.nameAr ?? "").includes(phrase) || co.nameEn.toLowerCase().includes(phrase.toLowerCase())
  )
  if (phraseHit) return phraseHit

  const tokens = cleaned.split(/\s+/).map((w) => normalizeAr(w)).filter((w) => w.length >= 2 && !GENERIC_NAME_WORDS.has(w))
  if (tokens.length > 0) {
    let best: { c: (typeof all)[number]; score: number; nameLen: number } | null = null
    for (const co of all) {
      const words = [
        ...normalizeAr(co.nameAr ?? "").split(/\s+/),
        ...co.nameEn.toLowerCase().split(/\s+/),
      ].filter((w) => w.length >= 2 && !GENERIC_NAME_WORDS.has(w))
      let score = 0
      for (const tok of tokens) {
        for (const w of words) {
          if (w === tok) {
            score += 2
            break
          }
          // "ابوك" extends the company word "ابو" (colloquial suffix), but a
          // bare 2-3 char stem must never match a LONGER different word
          if (tok.startsWith(w) && w.length >= 2) {
            score += 1
            break
          }
          if (w.startsWith(tok) && tok.length >= 3) {
            score += 1
            break
          }
        }
      }
      // tie-break: the more specific (shorter) name is the better match
      if (score > 0 && (!best || score > best.score || (score === best.score && words.join(" ").length < best.nameLen))) {
        best = { c: co, score, nameLen: words.join(" ").length }
      }
    }
    if (best) return best.c
  }
  return null
}
function fmtMetric(code: string, v: number | null | undefined, lang: Lang): string {
  if (v === null || v === undefined || Number.isNaN(v)) return lang === "ar" ? "غير متاح" : "N/A"
  const def = CALC_METRIC_MAP[code]
  if (def?.unit === "EGP") return formatEgp(v)
  if (def?.unit === "PERCENT") return `${v.toFixed(1)}%`
  if (def?.unit === "EGP_PER_SHARE") return `${v.toFixed(2)} EGP`
  return v.toFixed(2)
}

async function annualSeries(companyId: string, code: string, take = 5) {
  return db.calculatedMetric.findMany({
    where: { companyId, code, periodType: "ANNUAL", valueStatus: "OK", value: { not: null } },
    orderBy: { fiscalYear: "desc" },
    take,
  })
}

// ————— sector leaderboard (batched: one query per call) —————
async function sectorBest(code: string, sector: string | null, lang: Lang): Promise<QaAnswer> {
  const rows = (await db.$queryRawUnsafe(
    `SELECT cm.companyId, cm.value, cm.fiscalYear, cm.periodLabel,
            c.ticker, c."nameEn", c."nameAr", c.sector
     FROM CalculatedMetric cm
     JOIN Company c ON c.id = cm.companyId AND c."isActive" = 1
     WHERE cm.code = ? AND cm."valueStatus" = 'OK' AND cm.value IS NOT NULL
       AND cm."periodType" = 'ANNUAL' AND cm."fiscalYear" >= 2023
       ${sector ? `AND c.sector = ?` : ""}
     ORDER BY cm.value DESC`,
    code, ...(sector ? [sector] : [])
  )) as { companyId: string; value: number; fiscalYear: number; periodLabel: string; ticker: string; nameEn: string; nameAr: string | null; sector: string }[]

  // keep each company's latest year only, then rank
  const byCompany = new Map<string, (typeof rows)[number]>()
  for (const r of rows) {
    const prev = byCompany.get(r.companyId)
    if (!prev || r.fiscalYear > prev.fiscalYear) byCompany.set(r.companyId, r)
  }
  const ranked = [...byCompany.values()].sort((a, b) => b.value - a.value).slice(0, 10)
  const def = CALC_METRIC_MAP[code]
  const sectorLabel = sector ? (lang === "ar" ? SECTOR_AR[sector] ?? sector : sector) : lang === "ar" ? "السوق" : "the market"

  if (ranked.length === 0) {
    return {
      intent: "sectorBest", companyId: null, ticker: null,
      answer: lang === "ar" ? `لا توجد بيانات كافية لترتيب الشركات على مؤشر «${def?.labelAr ?? code}» في ${sectorLabel} — البيانات المُتحقق منها غير متاحة لكل شركات القطاع بعد.` : `Not enough verified data to rank companies by ${def?.labelEn ?? code} in ${sectorLabel}.`,
      figures: [], followUps: lang === "ar" ? ["أفضل شركات البنوك حسب ROE؟", "أفضل شركات الأغذية حسب هامش صافي الربح؟"] : ["Best banks by ROE?", "Top food companies by net margin?"],
    }
  }

  const lines = ranked.map((r, i) => `${i + 1}. **${r.ticker}** — ${lang === "ar" ? r.nameAr ?? r.nameEn : r.nameEn} — ${fmtMetric(code, r.value, lang)} (${r.periodLabel})`)
  return {
    intent: "sectorBest", companyId: null, ticker: null,
    answer: lang === "ar"
      ? `أعلى 10 شركات في ${sectorLabel} حسب **${def?.labelAr ?? code}** (أحدث سنة مالية متاحة لكل شركة، بيانات متحقق منها):\n\n${lines.join("\n")}`
      : `Top 10 ${sectorLabel} companies by **${def?.labelEn ?? code}** (each company's latest available fiscal year, verified data):\n\n${lines.join("\n")}`,
    figures: ranked.slice(0, 10).map((r) => ({ label: r.ticker, value: fmtMetric(code, r.value, lang), detail: r.periodLabel })),
    followUps: lang === "ar" ? ["إيه تقييم هذه الشركات؟", "أفضل شركات حسب نمو الأرباح؟"] : ["How are these valued?", "Best by profit growth?"],
  }
}

// ————— per-company answers —————
async function companyAnswer(
  company: { id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string },
  intent: string,
  metricCode: string | undefined,
  lang: Lang
): Promise<QaAnswer> {
  const name = lang === "ar" ? company.nameAr ?? company.nameEn : company.nameEn
  const g = await gatherCompanyAnalytics(company.id)
  const base = { companyId: company.id, ticker: company.ticker }
  const followUps = lang === "ar"
    ? ["هل الشركة مربحة؟", "إيه تقييم الشركة؟", "أحدث الأحداث؟", "أحسن شركات القطاع حسب ROE؟"]
    : ["Is the company profitable?", "How is it valued?", "Latest events?", "Best in sector by ROE?"]
  const notAvailable = (what: string): QaAnswer => ({
    intent, ...base,
    answer: lang === "ar"
      ? `معندش بيانات ${what} موثوقة لشركة **${name}** (${company.ticker}) في قاعدة البيانات المتحقق منها حالياً — مش هخمّن أو أفتي بأرقام غير متاحة. تابع صفحة الشركة، أول ما تُستورد القوائم الرسمية هيظهر المؤشر هنا.`
      : `I don't have verified ${what} data for **${name}** (${company.ticker}) yet — I won't estimate. Once official filings are imported, the metric appears on the company page.`,
    figures: [], followUps,
  })

  if (!g) return notAvailable(lang === "ar" ? "مالية" : "financial")

  const latest = g.latest ?? {}
  const prior = g.prior ?? {}
  const srcFig = (label: string, code: string, map: Record<string, number | null>): QaFigure | null => {
    const v = map[code.toUpperCase()]
    if (v === null || v === undefined) return null
    return { label, value: fmtMetric(code, v, lang) }
  }

  const sectorName = lang === "ar" ? SECTOR_AR[company.sector] ?? company.sector : company.sector

  switch (intent) {
    case "metric": {
      const code = metricCode!
      const v = latest[code.toUpperCase()]
      if (v === null || v === undefined) return notAvailable(CALC_METRIC_MAP[code]?.labelAr ?? code)
      const def = CALC_METRIC_MAP[code]
      const priorV = prior[code.toUpperCase()]
      const delta = priorV !== null && priorV !== undefined && v !== 0
        ? ` (${lang === "ar" ? "السنة السابقة" : "prior year"}: ${fmtMetric(code, priorV, lang)})`
        : ""
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `**${def?.labelAr ?? code}** لشركة **${name}** (${company.ticker}): **${fmtMetric(code, v, lang)}**${delta} — من أحدث قوائم سنوية متحقق منها (FY${g.latestYear}).`
          : `**${def?.labelEn ?? code}** for **${name}** (${company.ticker}): **${fmtMetric(code, v, lang)}**${delta} — from verified FY${g.latestYear} statements.`,
        figures: [
          srcFig(lang === "ar" ? "القيمة الحالية" : "Current", code, latest),
          srcFig(lang === "ar" ? "السنة السابقة" : "Prior year", code, prior),
          srcFig(lang === "ar" ? "العائد على حقوق الملكية ROE" : "ROE", "roe", latest),
          srcFig(lang === "ar" ? "هامش صافي الربح" : "Net margin", "net_margin", latest),
        ].filter((f): f is QaFigure => f !== null),
        followUps,
      }
    }
    case "profit": {
      const np = latest["NET_PROFIT"]
      if (np === null || np === undefined) return notAvailable(lang === "ar" ? "صافي الربح" : "net profit")
      const profitable = np > 0
      const rev = latest["REVENUE"]
      const margin = latest["NET_MARGIN"]
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `${profitable ? "نعم" : "لا"} — شركة **${name}** ${profitable ? `مربحة: صافي ربح **${formatEgp(np)}**` : `في خسارة: **${formatEgp(np)}**`} في FY${g.latestYear} (أحدث قوائم متحقق منها).${rev !== null && rev !== undefined ? ` الإيرادات: ${formatEgp(rev)}.` : ""}${margin !== null && margin !== undefined ? ` هامش صافي الربح: ${margin.toFixed(1)}%.` : ""}`
          : `**${name}** ${profitable ? `is profitable: net income **${formatEgp(np)}**` : `posted a loss of **${formatEgp(np)}**`} in FY${g.latestYear} (latest verified statements).${rev !== null && rev !== undefined ? ` Revenue: ${formatEgp(rev)}.` : ""}${margin !== null && margin !== undefined ? ` Net margin: ${margin.toFixed(1)}%.` : ""}`,
        figures: [
          { label: lang === "ar" ? `صافي الربح FY${g.latestYear}` : `Net profit FY${g.latestYear}`, value: formatEgp(np) },
          srcFig(lang === "ar" ? "الإيرادات" : "Revenue", "revenue", latest),
          srcFig(lang === "ar" ? "هامش صافي الربح" : "Net margin", "net_margin", latest),
          srcFig(lang === "ar" ? "صافي الربح (السنة السابقة)" : "Net profit (prior year)", "net_profit", prior),
        ].filter((f): f is QaFigure => f !== null),
        followUps,
      }
    }
    case "valuation": {
      const s = await computeCompanyScores(company.id).catch(() => null)
      const v = s?.valuation ?? null
      const pe = v?.pe ?? latest["P_E"]
      const pb = v?.pb ?? latest["P_B"]
      if ((pe === null || pe === undefined) && (pb === null || pb === undefined)) return notAvailable(lang === "ar" ? "تقييم سوقي (سعر سهم)" : "market valuation (price)")
      const discount = v?.peDiscountPct ?? null
      const verdict = v?.verdict ?? null
      const verdictAr: Record<string, string> = { undervalued: "أقل من قيمتها النسبية مقارنة بالقطاع", fair: "قريبة من تقييم قطاعها", expensive: "أعلى من تقييم قطاعها", "no-price": "بدون سعر سهم حديث" }
      const verdictEn: Record<string, string> = { undervalued: "trading below its sector-relative value", fair: "fairly priced vs its sector", expensive: "priced above its sector", "no-price": "no recent share price" }
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `تقييم **${name}**: P/E = **${pe !== null && pe !== undefined ? pe.toFixed(1) + "x" : "غير متاح"}**، P/B = **${pb !== null && pb !== undefined ? pb.toFixed(2) + "x" : "غير متاح"}**.${discount !== null && pe !== null && pe !== undefined ? ` نسبةً لوسيط قطاع ${sectorName}: الشركة ${verdictAr[verdict ?? "fair"]} (${discount >= 0 ? "أرخص" : "أغلى"} بـ ${Math.abs(Math.round(discount))}%). المقارنة استرشادية من مؤشرات متحقق منها — ليست توصية شراء أو بيع.`
            : ` المقارنة القطاعية غير متاحة لعدم كفاية أسعار أو أقران متحقق منهم.`
          }`
          : `**${name}** valuation: P/E = **${pe !== null && pe !== undefined ? pe.toFixed(1) + "x" : "N/A"}**, P/B = **${pb !== null && pb !== undefined ? pb.toFixed(2) + "x" : "N/A"}**.${discount !== null && pe !== null && pe !== undefined ? ` vs ${sectorName} median: currently ${verdictEn[verdict ?? "fair"]} (${Math.abs(Math.round(discount))}% ${discount >= 0 ? "cheaper" : "pricier"}). Indicative only — not investment advice.` : ""}`,
        figures: [
          srcFig("P/E", "p_e", latest),
          srcFig("P/B", "p_b", latest),
          srcFig(lang === "ar" ? "القيمة السوقية" : "Market cap", "market_cap", latest),
          srcFig(lang === "ar" ? "عائد التوزيعات" : "Dividend yield", "dividend_yield", latest),
          ...(discount !== null ? [{ label: lang === "ar" ? "الفرق عن وسيط القطاع (P/E)" : "vs sector median P/E", value: `${discount >= 0 ? "-" : "+"}${Math.abs(Math.round(discount))}%` }] : []),
        ].filter((f): f is QaFigure => f !== null),
        followUps,
      }
    }
    case "health": {
      const s = await computeCompanyScores(company.id)
      if (!s || s.overall === null) return notAvailable(lang === "ar" ? "كفاية لتقييم الصحة المالية" : "data sufficient for a health score")
      const compLabel: Record<string, { ar: string; en: string }> = {
        profitability: { ar: "الربحية", en: "Profitability" },
        growth: { ar: "النمو", en: "Growth" },
        liquidity: { ar: "السيولة", en: "Liquidity" },
        leverage: { ar: "الرفع المالي", en: "Leverage" },
        cash: { ar: "التدفق النقدي", en: "Cash" },
        efficiency: { ar: "الكفاءة", en: "Efficiency" },
      }
      const comps = s.components.filter((c) => c.score !== null)
      const strongest = comps.length ? comps.slice().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] : null
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `درجة الصحة المالية لشركة **${name}**: **${Math.round(s.overall)}/100**${strongest ? ` — أقوى جانب: ${compLabel[strongest.key]?.ar ?? strongest.key}` : ""}. الدرجة حسابية من مؤشرات متحقق منها (ربحية/نمو/سيولة/رفع مالي/نقدية) على أحدث قوائم متاحة، مش رأي استثماري.`
          : `**${name}** financial health: **${Math.round(s.overall)}/100**${strongest ? ` — strongest pillar: ${compLabel[strongest.key]?.en ?? strongest.key}` : ""}. Computed from verified metrics, not investment advice.`,
        figures: s.components.map((c) => ({ label: lang === "ar" ? compLabel[c.key]?.ar ?? c.key : compLabel[c.key]?.en ?? c.key, value: c.score === null ? "—" : `${Math.round(c.score)}/100` })),
        followUps,
      }
    }
    case "events": {
      const events = await db.financialEvent.findMany({
        where: { companyId: company.id },
        orderBy: [{ detectedAt: "desc" }],
        take: 5,
        select: { eventType: true, explanationEn: true, explanationAr: true, periodLabel: true, detectedAt: true },
      })
      if (events.length === 0)
        return {
          intent, ...base,
          answer: lang === "ar" ? `مفيش أحداث مالية مسجّلة لشركة **${name}** في نظام الماسح حتى الآن.` : `No financial events recorded for **${name}** yet.`,
          figures: [], followUps,
        }
      const labelOf = (e: { eventType: string }) => {
        const meta = EVENT_TYPE_MAP[e.eventType]
        return lang === "ar" ? meta?.labelAr ?? e.eventType : meta?.labelEn ?? e.eventType
      }
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `أحدث الأحداث المالية المكتشفة لشركة **${name}**:\n\n${events.map((e, i) => `${i + 1}. **${labelOf(e)}** (${e.periodLabel}) — ${e.explanationAr ?? e.explanationEn}`).join("\n")}`
          : `Latest detected events for **${name}**:\n\n${events.map((e, i) => `${i + 1}. **${labelOf(e)}** (${e.periodLabel}) — ${e.explanationEn}`).join("\n")}`,
        figures: events.map((e) => ({ label: e.periodLabel, value: labelOf(e), detail: lang === "ar" ? e.explanationAr ?? e.explanationEn : e.explanationEn })),
        followUps,
      }
    }
    case "dividend": {
      const divs = await db.dividend.findMany({ where: { companyId: company.id }, orderBy: { announcementDate: "desc" }, take: 4 })
      const y = latest["DIVIDEND_YIELD"]
      if (divs.length === 0 && (y === null || y === undefined))
        return {
          intent, ...base,
          answer: lang === "ar" ? `مفيش توزيعات مسجّلة لشركة **${name}** في قاعدة البيانات.` : `No recorded dividends for **${name}**.`,
          figures: [], followUps,
        }
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `توزيعات **${name}**:${y !== null && y !== undefined ? ` عائد التوزيعات الحالي **${y.toFixed(2)}%**.` : ""}${divs.length ? ` آخر ${divs.length} توزيعات مسجّلة ظاهرة في التفاصيل.` : ""}`
          : `**${name}** dividends:${y !== null && y !== undefined ? ` current yield **${y.toFixed(2)}%**.` : ""}`,
        figures: [
          ...(y !== null && y !== undefined ? [{ label: lang === "ar" ? "عائد التوزيعات" : "Dividend yield", value: `${y.toFixed(2)}%` }] : []),
          ...divs.map((d) => ({ label: d.distributionDate ? new Date(d.distributionDate).toISOString().slice(0, 10) : lang === "ar" ? "غير معلن" : "TBD", value: d.dividendPerShare ? `${d.dividendPerShare} EGP/سهم` : lang === "ar" ? "—" : "—", detail: d.status })),
        ],
        followUps,
      }
    }
    case "price": {
      if (g.currentPrice === null) return notAvailable(lang === "ar" ? "سعر سهم" : "share price")
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `آخر سعر مسجّل لسهم **${name}** (${company.ticker}): **${g.currentPrice.toLocaleString()} EGP**${g.priceReturn1Y !== null ? `، والتغير خلال سنة: ${g.priceReturn1Y >= 0 ? "+" : ""}${g.priceReturn1Y.toFixed(1)}%` : ""}.`
          : `Last recorded price for **${name}** (${company.ticker}): **${g.currentPrice.toLocaleString()} EGP**${g.priceReturn1Y !== null ? `, 1Y change: ${g.priceReturn1Y >= 0 ? "+" : ""}${g.priceReturn1Y.toFixed(1)}%` : ""}.`,
        figures: [
          { label: lang === "ar" ? "آخر سعر" : "Last price", value: `${g.currentPrice.toLocaleString()} EGP` },
          ...(g.priceReturn1Y !== null ? [{ label: lang === "ar" ? "تغير سنة" : "1Y change", value: `${g.priceReturn1Y.toFixed(1)}%` }] : []),
        ],
        followUps,
      }
    }
    case "peers": {
      if (!g.peers.length)
        return {
          intent, ...base,
          answer: lang === "ar" ? `مفيش شركات مقارنة كافية في قطاع ${sectorName} لـ **${name}** (محتاجين 3 شركات مُدرجة على الأقل بنفس القوائم).` : `Not enough listed peers in ${sectorName} to compare **${name}**.`,
          figures: [], followUps,
        }
      const rows = g.peers.slice(0, 6).map((p) => ({
        label: p.ticker,
        value: fmtMetric("roe", p.latest["ROE"], lang),
        detail: `P/E: ${p.latest["P_E"] !== null && p.latest["P_E"] !== undefined ? (p.latest["P_E"] as number).toFixed(1) + "x" : "—"}`,
      }))
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `مقارنة **${name}** بأقرانها في قطاع ${sectorName} (أحدث سنة متاحة لكل شركة):\n\n${rows.map((r, i) => `${i + 1}. ${r.label} — ROE ${r.value} — ${r.detail}`).join("\n")}`
          : `**${name}** vs ${sectorName} peers:\n\n${rows.map((r, i) => `${i + 1}. ${r.label} — ROE ${r.value} — ${r.detail}`).join("\n")}`,
        figures: rows,
        followUps,
      }
    }
    case "growth": {
      const items = ["revenue_growth", "profit_growth", "equity_growth", "asset_growth", "eps_growth"]
        .map((code) => ({ code, v: latest[code.toUpperCase()] }))
        .filter((x) => x.v !== null && x.v !== undefined) as { code: string; v: number }[]
      if (items.length === 0) return notAvailable(lang === "ar" ? "نمو كافٍ للمقارنة السنوية" : "growth (needs two consecutive years)")
      return {
        intent, ...base,
        answer: lang === "ar"
          ? `نمو **${name}** في FY${g.latestYear} (مقارنة بالسنة السابقة):\n\n${items.map((x) => `- ${CALC_METRIC_MAP[x.code]?.labelAr ?? x.code}: **${x.v >= 0 ? "+" : ""}${x.v.toFixed(1)}%**`).join("\n")}`
          : `**${name}** FY${g.latestYear} growth (vs prior year):\n\n${items.map((x) => `- ${CALC_METRIC_MAP[x.code]?.labelEn ?? x.code}: **${x.v >= 0 ? "+" : ""}${x.v.toFixed(1)}%**`).join("\n")}`,
        figures: items.map((x) => ({ label: CALC_METRIC_MAP[x.code]?.labelAr ?? x.code, value: `${x.v >= 0 ? "+" : ""}${x.v.toFixed(1)}%` })),
        followUps,
      }
    }
    default: {
      // summary — the full picture from verified data
      const s = await computeCompanyScores(company.id).catch(() => null)
      const series = await annualSeries(company.id, "net_profit", 4)
      const trend = series.length >= 2
        ? lang === "ar"
          ? ` صافي الربح عبر السنوات: ${series.map((r) => `FY${r.fiscalYear}: ${formatEgp(r.value ?? 0)}`).join(" → ")}.`
          : ` Net profit trend: ${series.map((r) => `FY${r.fiscalYear}: ${formatEgp(r.value ?? 0)}`).join(" → ")}.`
        : ""
      const keyFigs = [
        srcFig(lang === "ar" ? "الإيرادات" : "Revenue", "revenue", latest),
        srcFig(lang === "ar" ? "صافي الربح" : "Net profit", "net_profit", latest),
        srcFig("ROE", "roe", latest),
        srcFig(lang === "ar" ? "هامش صافي الربح" : "Net margin", "net_margin", latest),
        srcFig("P/E", "p_e", latest),
      ].filter((f): f is QaFigure => f !== null)
      return {
        intent: "summary", ...base,
        answer: lang === "ar"
          ? `**${name}** (${company.ticker}) — قطاع ${sectorName}. على أحدث قوائم متحقق منها FY${g.latestYear}:${keyFigs.map((f) => ` ${f.label} = ${f.value};`).join("")}${trend}${s && s.overall !== null ? ` درجة الصحة المالية: ${Math.round(s.overall)}/100.` : ""} الأرقام من قاعدة البيانات المتحقق منها — راجع صفحة الشركة لمصدر كل رقم قبل القرار.`
          : `**${name}** (${company.ticker}) — ${sectorName}. Latest verified FY${g.latestYear}:${keyFigs.map((f) => ` ${f.label} = ${f.value};`).join("")}${trend}${s && s.overall !== null ? ` Health score: ${Math.round(s.overall)}/100.` : ""} Every figure traces to a verified filing — check the company page for sources before deciding.`,
        figures: keyFigs,
        followUps,
      }
    }
  }
}

// ————— entry point —————
export async function answerQuestion(question: string, opts: { companyId?: string | null; lang?: Lang } = {}): Promise<QaAnswer> {
  const q = question.toLowerCase().trim()
  const lang = opts.lang ?? detectLang(question)

  const company = await resolveCompany(question, opts.companyId ?? null)
  const { intent, metricCode } = detectIntent(q)

  if (intent === "sectorBest" || (!company && intent !== "metric")) {
    if (intent === "sectorBest") {
      // in a company context, "أحسن شركات القطاع" means THAT company's sector
      const sector = detectSector(q) ?? (opts.companyId ? company?.sector ?? null : null)
      return sectorBest(metricCode!, sector, lang)
    }
  }

  if (!company) {
    return {
      intent: "unresolved", companyId: null, ticker: null,
      answer: lang === "ar"
        ? "اكتب اسم الشركة أو رمزها (زي ABUK أو «ابوك قائية») عشان أجاوب من البيانات المتحقق منها — أو اسأل عن قطاع كامل زي «أفضل شركات البنوك حسب ROE»."
        : "Name a company (e.g. ABUK) or ask about a whole sector, like “best banks by ROE”.",
      figures: [],
      followUps: lang === "ar"
        ? ["أفضل شركات البنوك حسب ROE؟", "تحليل ABUK", "إيرادات مصر لصناعة الأسمدة 2025؟", "أسعار عملت يوربا؟"]
        : ["Best banks by ROE?", "Analyze ABUK", "Top food by margin?"],
    }
  }

  return companyAnswer(company, intent, metricCode, lang)
}
