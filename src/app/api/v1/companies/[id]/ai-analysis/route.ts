import { NextRequest } from "next/server"
import { chatComplete, type AiChatResult } from "@/lib/ai/provider"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireAuth, unauthorizedResponse } from "@/lib/access"
import { isPremiumUser } from "@/lib/subscription"
import { checkEndpointRateLimit } from "@/lib/rate-limit"
import { canUseSmartAnalysis, getSmartAnalysisUsage, consumeSmartAnalysisUsage } from "@/lib/smart-analysis-usage"
import { buildRuleBasedAnalysis } from "@/lib/financial/rule-based-analysis"
import { RULE_BASED_MODEL, buildAiSnapshotBundle } from "@/lib/ai/analysis-snapshot"

// GET  /api/v1/companies/[id]/ai-analysis?lang=ar|en — latest cached AI analysis (or null)
// POST /api/v1/companies/[id]/ai-analysis — generate a grounded expert analysis
//
// GROUNDING RULES (the core of this endpoint): the model receives a JSON
// snapshot built EXCLUSIVELY from verified database data — calculated metrics
// (single preferred statement basis, never mixed consolidated/standalone), the
// latest period's raw line-item values from trusted reports, detected events
// with their matched conditions, deterministic investor signals and research
// modules derived from the same verified values, and market data. Nothing is
// invented server-side either: the prompt forbids fabrication, missing data
// must be called out as unavailable. Identical data (same sha256 of the
// snapshot) is served from the AiAnalysis cache without an LLM call — unless
// the cached row is a degraded (rule-based) fallback, in which case the real
// LLM gets another chance. Pipeline/data-engineering metadata is intentionally
// kept out of the snapshot so analyses never surface data-quality
// documentation to users.

const SYSTEM_PROMPT = `You are a senior buy-side equity analyst and portfolio manager with 20+ years covering Egyptian Exchange (EGX) and frontier-emerging-market equities. You think like a forensic fundamental investor: unit economics first, cash over accruals, balance-sheet solvency, capital-allocation discipline, valuation versus sector peers, and risk before reward. You are direct, specific, and numerate — an expert reading, not a summary.

You receive a JSON snapshot containing: verified financial data (calculated metrics per period, the latest period's raw line items, detected events), deterministic investor signals and analysis modules computed from the same verified values, company scores with a sector-relative valuation read, and market data (price, trailing dividends).

ANALYST FRAMEWORK — reason through all of it and weave the findings into prose (never dump the checklist):
1. Quality of earnings: do reported profits convert into operating cash? Margin sustainability, accrual red flags, one-offs. Cross-check cash taxes paid vs booked tax expense and cash interest vs booked interest when present.
2. Growth & durability: revenue and earnings trajectory across periods, drivers, cyclicality; respect quarterly-vs-annual boundaries.
3. Balance sheet & liquidity: leverage (D/E, net debt/EBITDA), interest coverage, working-capital behavior, dilution or capital raises.
4. Capital allocation & shareholder returns: dividends, reinvestment, buybacks.
5. Valuation: P/E and P/B versus sector medians, what expectations are priced in; say plainly when no price or multiples exist.
6. Risks first: anomalies, red flags, deteriorating signals, unusual events — quantify them.
7. For banks: regulatory capital (CET1/Tier1/total vs Basel III floors), non-performing loans versus equity, and the funding model — treat capital adequacy as the primary solvency lens instead of corporate leverage ratios.

STRICT RULES:
(1) Use ONLY numbers present in the provided JSON — never invent, estimate, or fabricate any figure.
(2) Metrics marked "unavailable" must be stated as not available — never treat missing as zero.
(3) Always cite the period label for every figure you use.
(4) Never compare quarterly with annual periods directly; say when the reading is limited to short periods.
(5) The provided signals/modules are deterministic readings of the same data — verify them against the raw numbers, and disagree openly when the numbers do not support them.
(6) Never discuss data pipelines, extraction, validation, data quality or source tracing — analyze the business, not the dataset.
(7) Close with an overall stance (bullish / cautiously positive / neutral / bearish) with a conviction level and the specific trigger that would change it. This is market commentary, not personalized investment advice — never phrase it as an instruction to buy or sell.

OUTPUT — clean markdown in the requested language, exactly these section headings in order. The heading line must contain ONLY the heading text itself — never append the format notes after the heading; those describe what to write under it:
## Investment Thesis
(3-5 sentences with numbers — your core expert view)
## Key Numbers
(a proper markdown table — a header row, a pipe-dashes separator row like |---|---|, then one row per line — of the most decision-relevant verified figures: revenue, net profit, margins, net debt, operating cash flow / free cash flow, plus CET1 & NPL for banks; each row carries its period label; omit rows whose data is unavailable rather than padding; NEVER write the table on a single line)
## Quality of Earnings & Profitability
## Growth & Momentum
## Balance Sheet & Cash Flow
## Valuation
(versus sector and what is priced in; state clearly when valuation is not available)
## Bull Case
(2-4 tight bullets)
## Bear Case & Red Flags
(2-4 tight bullets)
## Catalysts & What to Watch
## Overall Stance
(stance + conviction level + the specific invalidation trigger)`

// Vercel serverless function ceiling for this route. The LLM attempt plan
// (primary → retry → fallback, see src/lib/ai/provider.ts) stays inside
// AI_TIMEOUT_MS = 100s; the extra headroom covers snapshot building, quota
// handling and persistence around the LLM call. Ignored outside Vercel.
export const maxDuration = 120

const AR_INSTRUCTION =
  "\n\nاكتب التحليل باللغة العربية الفصحى الواضحة (الأرقام والأكواد اللاتينية تبقى كما هي) بهذه العناوين بنفس الترتيب. العنوان يجب أن يكون نص العنوان فقط — بلا أي وصف ملاصق له؛ الوصف بين القوسين يوضح ما يُكتب تحته: " +
  "## أطروحة الاستثمار\n(٣-٥ جمل بالأرقام، رأيك الخبير الجوهري) " +
  "## أبرز الأرقام\n(جدول ماركداون مركّز بأهم الأرقام المؤثرة في القرار: الإيرادات، صافي الربح، الهوامش، صافي الدين، التدفق التشغيلي/الحر، وللبنوك CET1 والقروض المتعثرة — مع ذكر فترة كل رقم؛ اترك أي رقم غير متوفر ولا تعبئ بالتقدير) " +
  "## جودة الأرباح والربحية " +
  "## النمو والزخم " +
  "## الميزانية والتدفقات النقدية " +
  "## التقييم\n(مقابل القطاع وما هو مسعّر في السعر؛ وضّح بصراحة عندما لا يتوفر تقييم) " +
  "## الحالة الصاعدة (Bull Case)\n(من نقطتين إلى أربع نقاط مركزة) " +
  "## الحالة الهابطة والمخاطر الحمراء\n(من نقطتين إلى أربع نقاط مركزة) " +
  "## المحفزات وما يجب مراقبته " +
  "## الموقف العام\n(الموقف + درجة الثقة + المُحفّز الذي يغيّر الرأي). " +
  "استخدم أرقام البيانات فقط مع ذكر فترة كل رقم، وحلّل كمحلل محترف خبير لا كسارد أخبار."

const EN_INSTRUCTION =
  "\n\nWrite the analysis in English with exactly the sections specified in the system prompt. Use only data figures with period labels, and analyze like a seasoned professional investor — not a news summarizer."

const AI_TIMEOUT_MS = 100_000
// v5.1 speed cap: NVIDIA streams ~150 tok/s, so a sprawling 3-5k-token
// report costs 50s+ end-to-end. A hard word budget keeps the report dense
// and the request fast (600 words ≈ 20-30s). Set 0 to uncapped.
const AI_MAX_WORDS = Number(process.env.AI_ANALYSIS_MAX_WORDS || "") || 600
const LENGTH_BUDGET =
  AI_MAX_WORDS > 0
    ? `\n\nLength budget: the entire report must stay under ${AI_MAX_WORDS} words total — dense and numeric, every section tight, zero filler or repetition. This budget overrides any longer count implied by the section notes.`
    : ""
// The provider now orchestrates retries + fallback-model internally inside the
// request budget (primary → primary → AI_MODEL_FALLBACK), so one outer attempt
// is enough and the worst case can never exceed maxDuration.
const AI_ATTEMPTS = 1
const MAX_INPUT_SUMMARY_CHARS = 20_000

const FREE_SMART_ANALYSIS_LIMIT = 3

async function callLlm(snapshotJson: string, lang: "ar" | "en"): Promise<AiChatResult> {
  return chatComplete({
    system: SYSTEM_PROMPT,
    user: "Company data (JSON):\n" + snapshotJson + (lang === "ar" ? AR_INSTRUCTION : EN_INSTRUCTION) + LENGTH_BUDGET,
    timeoutMs: AI_TIMEOUT_MS,
  })
}

// GET — latest stored analysis for the company (auth + usage-gated)
async function getHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
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
  const raw = decodeURIComponent(id)
  const upper = raw.toUpperCase()
  const company = await db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
    select: { id: true },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const latestAll = await db.aiAnalysis.findFirst({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
  })
  // Prefer an analysis written in the requested language; fall back to the
  // latest of any language so the tab is never empty when only the other
  // language has been generated so far (regenerating rewrites it in-language).
  const langParam = new URL(req.url).searchParams.get("lang")?.toLowerCase() === "ar" ? "ar" : "en"
  const latest =
    latestAll && latestAll.lang === langParam
      ? latestAll
      : (await db.aiAnalysis.findFirst({
          where: { companyId: company.id, lang: langParam },
          orderBy: { createdAt: "desc" },
        })) ?? latestAll

  return Response.json({
    analysis: latest
      ? {
          content: latest.content,
          createdAt: latest.createdAt,
          periodKey: latest.periodKey,
          dataHash: latest.dataHash,
          model: latest.model,
          lang: latest.lang,
          degraded: latest.model === RULE_BASED_MODEL,
        }
      : null,
  })
}

// POST — generate (or serve cached) grounded expert analysis
async function postHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth(req as unknown as NextRequest)
  if (!userId) return unauthorizedResponse()

  const isPremium = await isPremiumUser(userId)

  // Cheap shields first: per-IP burst limit before any DB or LLM work.
  const burst = await checkEndpointRateLimit("ai-analysis", userId)
  if (!burst.allowed) {
    const retryAfter = Math.ceil((burst.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "AI analysis is limited to 10 generations per 10 minutes." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const { id } = await params
  const raw = decodeURIComponent(id)
  const upper = raw.toUpperCase()

  const company = await db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
  })
  if (!company) return Response.json({ error: "NOT_FOUND" }, { status: 404 })

  const body = (await req.json().catch(() => ({}))) as { lang?: string }
  const lang = ((body.lang ?? new URL(req.url).searchParams.get("lang") ?? "en").toLowerCase() === "ar"
    ? "ar"
    : "en") as "ar" | "en"

  // ---------- 1. Verified-data snapshot (metrics + raw line items + events +
  // scores + investor signals + research modules + market data) ----------
  const bundle = await buildAiSnapshotBundle(company)
  if (!bundle.hasData) {
    return Response.json(
      {
        error: "NO_DATA",
        message: "No verified financial data available for this company yet. Upload and approve financial statements first.",
      },
      { status: 400 }
    )
  }

  // ---------- 2. Cache: identical data + identical language → identical
  // analysis, no LLM call. Degraded (rule-based) rows never satisfy the cache
  // — the real LLM gets another chance as soon as a generation is requested.
  // Language is part of the cache key: the same dataset analyzed in the other
  // language is a separate generation, so users always read their own language. ----------
  const cached = await db.aiAnalysis.findFirst({
    where: { companyId: company.id, dataHash: bundle.dataHash, lang },
    orderBy: { createdAt: "desc" },
  })
  if (cached && cached.model !== RULE_BASED_MODEL) {
    return Response.json({
      analysis: {
        content: cached.content,
        createdAt: cached.createdAt,
        periodKey: cached.periodKey,
        dataHash: cached.dataHash,
        model: cached.model,
        lang: cached.lang,
        degraded: false,
      },
      cached: true,
    })
  }

  // ---------- 3. Monthly quota (free tier) — consumed atomically and only
  // when a generation is actually about to happen. Cache hits, 404s, NO_DATA
  // and rate-limited requests never burn quota; the conditional updateMany
  // closes the N-parallel-requests quota-bypass race. ----------
  if (!isPremium) {
    const consumed = await consumeSmartAnalysisUsage(userId, FREE_SMART_ANALYSIS_LIMIT)
    if (!consumed) {
      const usage = await getSmartAnalysisUsage(userId)
      return Response.json(
        { error: "USAGE_LIMIT_EXCEEDED", message: `Free tier limit: ${usage.limit} Smart Analyses per month. ${usage.remaining} remaining. Resets ${usage.resetAt}.`, usage },
        { status: 429 }
      )
    }
  }

  // ---------- 4. LLM call (backend only). The provider runs its bounded
  // attempt plan (primary → primary → fallback) internally; only when every
  // attempt fails does the deterministic rule-based analysis serve as a
  // clearly-labeled degraded fallback. ----------
  let content: string | undefined
  let model = RULE_BASED_MODEL // replaced by the actual model on success
  let lastError = ""
  for (let attempt = 1; attempt <= AI_ATTEMPTS; attempt++) {
    try {
      const result = await callLlm(bundle.snapshotJson, lang)
      if (result.content.trim()) {
        content = result.content
        model = result.model
        break
      }
      lastError = `empty response (attempt ${attempt})`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  if (!content) {
    // A previous degraded row for the same dataHash means the LLM was already
    // down for this exact dataset — refresh its timestamp instead of piling up
    // identical fallback rows.
    if (cached && cached.model === RULE_BASED_MODEL) {
      await db.aiAnalysis.update({ where: { id: cached.id }, data: { createdAt: new Date() } })
      await audit("AI_ANALYSIS", {
        actor: "system",
        entityType: "Company",
        entityId: company.id,
        details: `LLM unavailable (${lastError.slice(0, 400)}) — re-served cached rule-based analysis`,
      })
      return Response.json({
        analysis: {
          content: cached.content,
          createdAt: cached.createdAt,
          periodKey: cached.periodKey,
          dataHash: cached.dataHash,
          model: cached.model,
          degraded: true,
        },
        cached: true,
        degraded: true,
      })
    }
    content = buildRuleBasedAnalysis(JSON.parse(bundle.snapshotJson), lang)
    model = RULE_BASED_MODEL
    await audit("AI_ANALYSIS", {
      actor: "system",
      entityType: "Company",
      entityId: company.id,
      details: `LLM unavailable (${lastError.slice(0, 400)}) — served rule-based analysis`,
    })
  }

  // ---------- 5. Persist (inputSummary truncated for storage sanity) ----------
  const saved = await db.aiAnalysis.create({
    data: {
      companyId: company.id,
      periodKey: bundle.latestAnnualKey,
      content,
      dataHash: bundle.dataHash,
      inputSummary: bundle.snapshotJson.slice(0, MAX_INPUT_SUMMARY_CHARS),
      model,
      lang,
    },
  })

  await audit("AI_ANALYSIS", {
    actor: "system",
    entityType: "Company",
    entityId: company.id,
    details: `Grounded expert AI analysis generated (${bundle.statementBasis} basis, snapshot ${bundle.dataHash.slice(0, 12)}…, ${bundle.promptPeriodCount} periods, ${bundle.eventCount} events, model ${model})`,
  })

  return Response.json({
    analysis: {
      content: saved.content,
      createdAt: saved.createdAt,
      periodKey: saved.periodKey,
      dataHash: saved.dataHash,
      model: saved.model,
      lang: saved.lang,
      degraded: saved.model === RULE_BASED_MODEL,
    },
    cached: false,
    degraded: saved.model === RULE_BASED_MODEL,
  })
}

// ---------- Hardened public wrappers ----------
// Any uncaught failure above (auth DB hiccups, snapshot queries hitting a
// Turso "Resource exhausted: mem_hrana_response" spike, persistence errors)
// must surface as a JSON error the frontend can render — never as the default
// HTML 500 page (production incident 2026-11-06: exactly that, from an
// uncaught Turso memory-exhaustion throw inside snapshot building).

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await getHandler(req, ctx)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("ai-analysis GET error:", msg.slice(0, 200))
    return Response.json(
      {
        error: "AI_ANALYSIS_TEMPORARILY_UNAVAILABLE",
        message: "Temporary database hiccup — please try again shortly. | خلل مؤقت في قاعدة البيانات — حاول بعد قليل.",
      },
      { status: 503 }
    )
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    return await postHandler(req, ctx)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error("ai-analysis POST error:", msg.slice(0, 200))
    try {
      await audit("AI_ANALYSIS", {
        actor: "system",
        entityType: "Company",
        entityId: "unknown",
        details: `Generation crashed before completion: ${msg.slice(0, 200)}`,
      })
    } catch {
      // auditing must never mask the original failure
    }
    return Response.json(
      {
        error: "AI_ANALYSIS_TEMPORARILY_UNAVAILABLE",
        message: "Temporary database hiccup — حاول بعد قليل. | Temporary database hiccup — please try again shortly.",
      },
      { status: 503 }
    )
  }
}
