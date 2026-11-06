// Unified LLM provider — works BOTH in the z-ai sandbox and on Vercel.
//
// Priority order:
//   1. AI_API_KEY (+ optional AI_BASE_URL / AI_MODEL / AI_MODEL_FALLBACK) →
//      OpenAI-compatible chat-completions over plain fetch. Works with Google
//      Gemini's OpenAI-compatible endpoint, GLM/Zhipu (open.bigmodel.cn),
//      OpenRouter, or any OpenAI-style API. This is the Vercel production path.
//   2. No AI_API_KEY → z-ai-web-dev-sdk (sandbox-only). On Vercel the SDK
//      cannot authenticate, so chatComplete() throws and routes fall back to
//      their existing graceful degradation (rule-based analysis / 502).
//
// Resilience (production lesson from 2026-11-06): Gemini answered
// "503 — this model is currently experiencing high demand" to every call for
// tens of minutes. The old code did two back-to-back attempts each with the
// FULL request timeout, so one hanging attempt could blow past the route's
// maxDuration and kill the function (500). The external path now runs a
// bounded attempt plan — primary model twice (transient 5xx/429 answers come
// back in ~2s), then the fallback model once (AI_MODEL_FALLBACK, e.g.
// gemini-2.5-flash) — with per-attempt timeouts that always fit inside the
// caller's budget, so serverless maxDuration is never exceeded.
//
// Configuration (Vercel env vars):
//   AI_API_KEY        — API key (required to enable the external provider)
//   AI_BASE_URL       — default: Gemini OpenAI-compatible endpoint
//                       (https://generativelanguage.googleapis.com/v1beta/openai/)
//                       e.g. GLM: https://open.bigmodel.cn/api/paas/v4/
//   AI_MODEL          — default: gemini-2.5-flash (e.g. glm-4-flash for GLM)
//   AI_MODEL_FALLBACK — optional second model tried when the primary keeps
//                       failing (e.g. gemini-2.5-flash under a newer primary)

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
const DEFAULT_MODEL = "gemini-2.5-flash"
const DEFAULT_TIMEOUT_MS = 90_000
const ATTEMPT_GAP_MS = 2_000
/** Budgets below this leave no room for a meaningful retry plan. */
const MIN_MULTI_ATTEMPT_BUDGET_MS = 36_000
/** Errors that mean the request itself (key/params) is broken — abort all attempts. */
const PERMANENT_ERROR_RE = /^AI API error (401|403):/

export interface AiHistoryMessage {
  role: "user" | "assistant"
  content: string
}

export interface AiChatRequest {
  system: string
  user: string
  history?: AiHistoryMessage[]
  timeoutMs?: number
}

/** Generated text plus the model that actually produced it (audit accuracy). */
export interface AiChatResult {
  content: string
  model: string
}

/** Model label persisted in the AiAnalysis rows / audit log. */
export function aiModelLabel(): string {
  if (externalAiConfigured()) {
    return (process.env.AI_MODEL || DEFAULT_MODEL).trim()
  }
  return "glm"
}

/** True when an explicit external provider key is present. */
export function externalAiConfigured(): boolean {
  return Boolean((process.env.AI_API_KEY || "").trim())
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// ---------- External OpenAI-compatible provider ----------

interface ApiAttempt {
  model: string
  timeoutMs: number
}

/**
 * Attempt plan inside the caller's budget: primary → primary → fallback.
 * The first attempt keeps ~45% of the budget (a real generation needs room);
 * retries get ~22% each (transient 5xx/429 answers arrive in ~2s). The 2s
 * gaps are accounted for, so the plan always fits inside budgetMs.
 */
function buildAttemptPlan(budgetMs: number): ApiAttempt[] {
  const primary = (process.env.AI_MODEL || DEFAULT_MODEL).trim()
  const fallback = (process.env.AI_MODEL_FALLBACK || "").trim()

  if (budgetMs < MIN_MULTI_ATTEMPT_BUDGET_MS) {
    return [{ model: primary, timeoutMs: budgetMs }]
  }

  // Streaming SSE starts producing bytes ~20s in even for 40KB+ prompts, but a
  // full grounded analysis (reasoning + 3-5k tokens) can run 60s+ — so the
  // first attempt keeps most of the budget and retries stay small (they exist
  // to catch fast transient errors, not to repeat long generations).
  const retryMs = Math.max(8_000, Math.round(budgetMs * 0.13))
  const plan: ApiAttempt[] = [
    { model: primary, timeoutMs: Math.max(10_000, Math.round(budgetMs * 0.68)) },
    { model: primary, timeoutMs: retryMs },
  ]
  if (fallback && fallback !== primary) {
    plan.push({ model: fallback, timeoutMs: retryMs })
  }

  // Final safety clamp: shrink retry timeouts if rounding pushed the plan
  // (including inter-attempt gaps) over budget.
  const used = plan.reduce((sum, a) => sum + a.timeoutMs, 0) + ATTEMPT_GAP_MS * (plan.length - 1)
  if (used > budgetMs) {
    const overflow = used - budgetMs
    for (let i = 1; i < plan.length && overflow > 0; i++) {
      const cut = Math.min(overflow, Math.max(0, plan[i].timeoutMs - 8_000))
      plan[i].timeoutMs -= cut
    }
  }
  return plan
}

/** Accumulate delta.content lines from an OpenAI-compatible SSE stream. */
async function readSseContent(res: Response, timeoutMs: number): Promise<string> {
  if (!res.body) throw new Error("AI provider returned no response body")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  let done = false
  // Hard ceiling on top of the fetch signal so a stalled stream never lingers.
  const deadline = Date.now() + timeoutMs
  try {
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        if (!line.startsWith("data:")) continue
        const data = line.slice(5).trim()
        if (data === "[DONE]") {
          done = true
          break
        }
        try {
          const parsed = JSON.parse(data) as {
            choices?: { delta?: { content?: string } }[]
          }
          const piece = parsed?.choices?.[0]?.delta?.content
          if (typeof piece === "string") content += piece
        } catch {
          // partial/keep-alive frames — skip
        }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  return content
}

async function chatViaExternalApi(req: AiChatRequest): Promise<AiChatResult> {
  const apiKey = (process.env.AI_API_KEY || "").trim()
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "")
  const budget = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000)
  const plan = buildAttemptPlan(budget)

  const messages = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
    ...(req.history ?? []),
  ]

  let lastError = ""
  for (let i = 0; i < plan.length; i++) {
    const attempt = plan[i]
    if (i > 0) await sleep(ATTEMPT_GAP_MS)
    try {
      // Stream the completion (SSE). NVIDIA's non-streaming path hangs
      // indefinitely for large prompts (>40KB) while the streaming path answers
      // in ~20-30s; Gemini's OpenAI-compatible endpoint supports the same
      // protocol, so this stays provider-agnostic.
      const res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        // Moderate temperature: deterministic-enough for financial analysis,
        // matches the NVIDIA example config the owner standardized on.
        body: JSON.stringify({ model: attempt.model, messages, temperature: 0.5, stream: true }),
        signal: AbortSignal.timeout(attempt.timeoutMs),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        lastError = `AI API error ${res.status}: ${body.slice(0, 160)}`
        if (PERMANENT_ERROR_RE.test(lastError)) {
          // Bad key / forbidden — no retry or fallback will help.
          throw new Error(lastError)
        }
        if (res.status === 404 && i === 0 && plan.length > 1) {
          // Primary model name unknown to the provider → jump straight to the
          // fallback model (skip the useless second primary attempt).
          i = plan.length - 2
        }
        continue
      }

      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const content = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        lastError = `empty stream response (model ${attempt.model})`
        continue
      }
      return { content, model: attempt.model }
    } catch (e) {
      if (e instanceof Error && PERMANENT_ERROR_RE.test(e.message)) throw e
      lastError = e instanceof Error ? e.message : String(e)
    }
  }
  throw new Error(lastError || "AI provider failed")
}

// ---------- z-ai sandbox SDK ----------

async function chatViaSandboxSdk(req: AiChatRequest): Promise<AiChatResult> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk")
  const zai = await ZAI.create()
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS

  // Keep the sandbox quirk: the system prompt is sent as an "assistant" turn
  // (that is what the production routes have always done with this SDK).
  const messages = [
    { role: "assistant" as const, content: req.system },
    { role: "user" as const, content: req.user },
    ...(req.history ?? []),
  ]

  const completion = await withTimeout(
    zai.chat.completions.create({ messages, thinking: { type: "disabled" } }),
    timeoutMs
  )
  return {
    content: completion?.choices?.[0]?.message?.content ?? "",
    model: "glm",
  }
}

/**
 * One-shot grounded chat completion against whichever provider is configured.
 * Returns the generated text and the model that produced it. Throws on total
 * failure — callers keep their own graceful degradation.
 */
export async function chatComplete(req: AiChatRequest): Promise<AiChatResult> {
  if (externalAiConfigured()) {
    return chatViaExternalApi(req)
  }
  return chatViaSandboxSdk(req)
}
