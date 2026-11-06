// Unified LLM provider — works BOTH in the z-ai sandbox and on Vercel.
//
// Priority order:
//   1. AI_API_KEY (+ optional AI_BASE_URL / AI_MODEL) → OpenAI-compatible
//      chat-completions over plain fetch. Works with Google Gemini's
//      OpenAI-compatible endpoint, GLM/Zhipu (open.bigmodel.cn), OpenRouter,
//      or any OpenAI-style API. This is the Vercel production path.
//   2. No AI_API_KEY → z-ai-web-dev-sdk (sandbox-only). On Vercel the SDK
//      cannot authenticate, so chatComplete() throws and routes fall back to
//      their existing graceful degradation (rule-based analysis / 502).
//
// Configuration (Vercel env vars):
//   AI_API_KEY   — API key (required to enable the external provider)
//   AI_BASE_URL  — default: Gemini OpenAI-compatible endpoint
//                  (https://generativelanguage.googleapis.com/v1beta/openai/)
//                  e.g. GLM: https://open.bigmodel.cn/api/paas/v4/
//   AI_MODEL     — default: gemini-2.5-flash (e.g. glm-4-flash for GLM)

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
const DEFAULT_MODEL = "gemini-2.5-flash"
const DEFAULT_TIMEOUT_MS = 90_000

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

// ---------- External OpenAI-compatible provider ----------

interface OpenAiCompletion {
  choices?: { message?: { content?: string } }[]
}

async function chatViaExternalApi(req: AiChatRequest): Promise<string> {
  const apiKey = (process.env.AI_API_KEY || "").trim()
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "")
  const model = (process.env.AI_MODEL || DEFAULT_MODEL).trim()
  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const messages = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
    ...(req.history ?? []),
  ]

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages }),
    signal: AbortSignal.timeout(timeoutMs),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    throw new Error(`AI API error ${res.status}: ${body.slice(0, 160)}`)
  }

  const data = (await res.json()) as OpenAiCompletion
  return data?.choices?.[0]?.message?.content ?? ""
}

// ---------- z-ai sandbox SDK ----------

async function chatViaSandboxSdk(req: AiChatRequest): Promise<string> {
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
  return completion?.choices?.[0]?.message?.content ?? ""
}

/**
 * One-shot grounded chat completion against whichever provider is configured.
 * Throws on failure — callers keep their own retry + fallback logic.
 */
export async function chatComplete(req: AiChatRequest): Promise<string> {
  if (externalAiConfigured()) {
    return chatViaExternalApi(req)
  }
  return chatViaSandboxSdk(req)
}
