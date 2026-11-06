import { NextRequest } from "next/server"
import { chatComplete } from "@/lib/ai/provider"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { requireAuth, unauthorizedResponse } from "@/lib/access"
import { isPremiumUser } from "@/lib/subscription"
import { checkEndpointRateLimit } from "@/lib/rate-limit"
import { buildAiSnapshotBundle, RULE_BASED_MODEL } from "@/lib/ai/analysis-snapshot"

// POST /api/v1/companies/[id]/ai-analysis/chat — grounded follow-up Q&A with
// the AI analyst. The conversation is anchored to the same verified-data
// snapshot as the generated analysis (metrics, raw line items, events,
// deterministic signals/modules, scores, market data) plus the latest stored
// analysis, so every answer stays grounded in verified numbers with period
// labels. The in-memory daily quota follows the /qa route pattern (free 10/day
// per user · premium 60/day); a burst limiter shields the LLM spend.

// Vercel serverless function ceiling for this route (CHAT_TIMEOUT_MS = 60s).
// Ignored outside Vercel.
export const maxDuration = 65

const CHAT_SYSTEM_PROMPT = `You are the same senior buy-side equity analyst who wrote this company's investment analysis — 20+ years covering Egyptian Exchange (EGX) and frontier-emerging-market equities, forensic fundamental style: unit economics, cash over accruals, solvency, capital allocation, valuation versus sector, risk first.

You receive: (a) the verified-data JSON snapshot for the company (calculated metrics per period, latest raw line items, detected events, deterministic signals/modules, scores, market data) and (b) the analysis you wrote, then the investor's conversation.

STRICT RULES:
(1) Use ONLY numbers present in the provided JSON — never invent, estimate, or fabricate any figure, and never pull outside "knowledge" about the company: you have no web access here.
(2) Metrics marked "unavailable" must be stated as not available — never treat missing as zero.
(3) Always cite the period label for figures you use.
(4) Never compare quarterly with annual periods directly.
(5) If the investor asks something the data cannot answer (news, rumors, future events, other companies not in the snapshot, macro forecasts), say plainly that it is outside the verified data and explain what in the data IS relevant instead.
(6) Never discuss data pipelines, extraction, validation, data quality or source tracing — analyze the business, not the dataset.
(7) Your stance may be challenged — re-examine the numbers honestly and concede when the investor's reading of the data is right.
(8) This is market commentary, not personalized investment advice — never phrase a stance as an instruction to buy or sell.

STYLE: answer in the investor's language (match it; Arabic stays Arabic with Latin numerals and tickers). Direct, specific, numerate — 2-6 short paragraphs or a compact bullet list. Lead with the answer, then the numbers that support it, then the caveat that matters. No headers needed unless comparing several things.`

const CHAT_TIMEOUT_MS = 60_000
const CHAT_ATTEMPTS = 2
const MAX_HISTORY_MESSAGES = 10
const MAX_MESSAGE_CHARS = 1_500
const MAX_ANALYSIS_CHARS = 12_000

// Daily quota per user (in-memory, same pattern as /api/v1/qa)
const RATE = new Map<string, { day: string; count: number }>()
const LIMITS = { free: 10, premium: 60 } as const

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await requireAuth(req as unknown as NextRequest)
  if (!userId) return unauthorizedResponse()

  // Burst shield before any DB/LLM work (per-user key — authenticated route)
  const burst = await checkEndpointRateLimit("ai-chat", userId)
  if (!burst.allowed) {
    const retryAfter = Math.ceil((burst.resetAt - Date.now()) / 1000)
    return Response.json(
      {
        error: "RATE_LIMITED",
        message: "Too many questions in a short time — wait a few minutes. | عدد الأسئلة كبير جدًا في وقت قصير — انتظر بضع دقائق.",
      },
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

  const body = (await req.json().catch(() => ({}))) as {
    messages?: unknown
    lang?: string
  }
  const lang = (body.lang ?? "en").toLowerCase() === "ar" ? "ar" : "en"

  // Sanitize conversation history
  const history: ChatMessage[] = Array.isArray(body.messages)
    ? (body.messages as unknown[])
        .filter(
          (m): m is ChatMessage =>
            !!m &&
            typeof m === "object" &&
            ((m as ChatMessage).role === "user" || (m as ChatMessage).role === "assistant") &&
            typeof (m as ChatMessage).content === "string"
        )
        .slice(-MAX_HISTORY_MESSAGES)
        .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) }))
    : []
  if (history.length === 0 || history[history.length - 1].role !== "user") {
    return Response.json({ error: "INVALID_PAYLOAD", message: "Conversation must end with a user question." }, { status: 400 })
  }

  // Daily quota (free vs premium) — bumped only when a question is answered
  const isPremium = await isPremiumUser(userId)
  const limit = isPremium ? LIMITS.premium : LIMITS.free
  const today = new Date().toISOString().slice(0, 10)
  const entry = RATE.get(userId) ?? { day: today, count: 0 }
  if (entry.day !== today) {
    entry.day = today
    entry.count = 0
  }
  if (entry.count >= limit) {
    return Response.json(
      {
        error: "QUOTA_EXCEEDED",
        message: isPremium
          ? "Daily analyst-chat quota reached — resets tomorrow. | وصلت للحد اليومي لأسئلة المحلل — يتجدد غدًا."
          : `Free tier allows ${LIMITS.free} analyst questions per day. Premium raises this to ${LIMITS.premium}. | الحد المجاني ${LIMITS.free} أسئلة للمحلل يوميًا — بريميوم يرفعه إلى ${LIMITS.premium}.`,
        usage: { used: entry.count, limit },
        resetAt: `${today}T23:59:59Z`,
      },
      { status: 429 }
    )
  }

  // ---------- Verified-data snapshot (same grounding as the analysis) ----------
  const bundle = await buildAiSnapshotBundle(company)
  if (!bundle.hasData) {
    return Response.json(
      { error: "NO_DATA", message: "No verified financial data available for this company yet." },
      { status: 400 }
    )
  }

  // Latest stored analysis anchors the conversation (may be null — chat still
  // works from the snapshot alone)
  const latestAnalysis = await db.aiAnalysis.findFirst({
    where: { companyId: company.id, model: { not: RULE_BASED_MODEL } },
    orderBy: { createdAt: "desc" },
    select: { content: true, createdAt: true },
  })

  const contextBlocks = [
    `VERIFIED COMPANY DATA (JSON — the only source of numbers):\n${bundle.snapshotJson}`,
    latestAnalysis
      ? `\nANALYSIS YOU WROTE EARLIER (for continuity):\n${latestAnalysis.content.slice(0, MAX_ANALYSIS_CHARS)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  // ---------- LLM call with one retry ----------
  let reply = ""
  let lastError = ""
  for (let attempt = 1; attempt <= CHAT_ATTEMPTS; attempt++) {
    try {
      reply = await chatComplete({
        system: CHAT_SYSTEM_PROMPT,
        user: contextBlocks,
        history,
        timeoutMs: CHAT_TIMEOUT_MS,
      })
      if (reply.trim()) break
      lastError = `empty response (attempt ${attempt})`
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e)
    }
  }

  if (!reply.trim()) {
    return Response.json(
      {
        error: "AI_FAILED",
        message: `The analyst could not answer right now (${lastError.slice(0, 80)}). Try again. | لم يستطع المحلل الإجابة الآن — حاول مجددًا.`,
      },
      { status: 502 }
    )
  }

  entry.count += 1
  RATE.set(userId, entry)

  await audit("AI_ANALYSIS", {
    actor: userId,
    entityType: "Company",
    entityId: company.id,
    details: `Analyst chat answered (${bundle.statementBasis} basis, snapshot ${bundle.dataHash.slice(0, 12)}…, ${history.length} messages in thread)`,
  })

  return Response.json({
    reply,
    usage: { used: entry.count, limit },
    snapshotDataHash: bundle.dataHash,
  })
}
