// Unified LLM provider — works BOTH in the z-ai sandbox and on Vercel.
//
// Priority order:
//   1. AI_API_KEY (+ optional AI_BASE_URL / AI_MODEL / AI_MODEL_FALLBACK) →
//      OpenAI-compatible chat-completions over plain fetch. Works with Google
//      Gemini's OpenAI-compatible endpoint, GLM/Zhipu (open.bigmodel.cn),
//      NVIDIA NIM (integrate.api.nvidia.com), OpenRouter, or any OpenAI-style
//      API. This is the Vercel production path.
//   2. No AI_API_KEY → z-ai-web-dev-sdk (sandbox-only). On Vercel the SDK
//      cannot authenticate, so chatComplete() throws and routes fall back to
//      their existing graceful degradation (rule-based analysis / 502).
//
// Resilience history:
//   v2 (2026-11-06): Gemini answered "503 — high demand" to everything for
//   tens of minutes; the bounded attempt plan (primary → primary → fallback,
//   per-attempt timeouts inside the caller's budget) stopped one hanging
//   attempt from blowing past the route's maxDuration.
//   v3 (2026-11-07): production started answering "AI API error 404: This
//   model models/gemini-2.5-flash is no longer available" — the provider had
//   RETIRED the pinned model. A pinned model name is a liability: providers
//   retire them without warning. The provider now DISCOVERS live models via
//   GET {baseUrl}/models (the OpenAI-compatible listing; Gemini/NIM/OpenRouter
//   all support it), scores them, and picks the best live chat model. An
//   AI_MODEL pin is honored when the provider actually lists it; otherwise
//   discovery replaces it within the SAME request (one extra fast GET — not a
//   retry storm). The resolved set is cached for 30 min per lambda instance.
//   If discovery itself fails, the configured names are used unchanged (v2
//   behavior). Future provider-side model retirements now self-heal with zero
//   code or env changes.
//   v4 (2026-11-07): Pollinations anonymous tier reports a busy per-IP slot
//   as HTTP 200 + JSON body ("RATE_LIMITED") — readSseContent saw no `data:`
//   frames and called it an "empty stream". v4 gates on content-type: a 200
//   without text/event-stream is an error in disguise; a rate-limit body
//   waits a slice of the unused budget and re-runs the SAME attempt (up to 2
//   times), because the per-IP slot frees the moment the other request ends.
//
// Configuration (Vercel env vars):
//   AI_API_KEY        — API key (required to enable the external provider)
//   AI_BASE_URL       — default: Gemini OpenAI-compatible endpoint
//                       (https://generativelanguage.googleapis.com/v1beta/openai/)
//                       e.g. GLM: https://open.bigmodel.cn/api/paas/v4/
//                       e.g. NVIDIA NIM: https://integrate.api.nvidia.com/v1
//   AI_MODEL          — preferred model; honored when the provider lists it live
//   AI_MODEL_FALLBACK — optional second model tried when the primary keeps
//                       failing (5xx/429 storms); filled from discovery when
//                       unset

const DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
const DEFAULT_MODEL = "gemini-3.8-flash"
const DEFAULT_TIMEOUT_MS = 90_000
const ATTEMPT_GAP_MS = 2_000
// v4: the anonymous tier answers an occupied per-IP slot with HTTP 200 + a
// JSON error body (never SSE). The slot frees when the other request
// finishes, so WAIT a slice of the unused budget and re-run the attempt.
const PATIENT_RETRY_MAX = 4
const PATIENT_RETRY_WAIT_MS = 12_000
const PATIENT_RETRY_MIN_REMAINING_MS = 20_000
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

// ---------- Live-model discovery (self-healing) ----------

const DISCOVERY_TTL_MS = 30 * 60_000
const DISCOVERY_TIMEOUT_MS = 8_000
/** Below this budget a discovery GET + a meaningful generation no longer fit. */
const MIN_DISCOVERY_BUDGET_MS = 15_000

let discoveryCache: { models: string[]; at: number } | null = null
let discoveryInflight: Promise<void> | null = null

// ---------- Serving-hang quarantine (fail fast on a dead provider) ----------
// 2026-11-07: the NVIDIA key authenticates (403 in 159ms for a wrong key) but
// the serving functions NEVER answer — every live model, any prompt size,
// streaming or not, just hangs with no HTTP status. When EVERY attempt in a
// request dies that way, quarantine the provider for a short window so users
// get the instant rule-based fallback instead of waiting out the full budget;
// the quarantine expires quickly so recovery is picked up promptly.
const QUARANTINE_MS = 3 * 60_000
let quarantineUntil = 0

/** Models that cannot serve a grounded text analysis (media/embedding/voice). */
function nonChatModel(id: string): boolean {
  return /(embedding|aqa|imagen|veo|lyria|tts|transcribe|translate|\blive\b|omni|banana|image|audio|video|robotics|computer-use|cyber|whisper|speech|rerank|guard)/i.test(id)
}

/**
 * Higher score = better default chat model for grounded financial analysis.
 * Flash-tier models win (free-tier friendly, fast); -latest/-preview aliases
 * lose a little (silent point moves); higher generation versions win.
 */
export function scoreModelId(id: string): number {
  if (nonChatModel(id)) return -1_000
  let s = 0
  if (/deprecated|retired|preview|\bexp\b|-latest/i.test(id)) s -= 25
  if (/flash/i.test(id)) s += 30
  if (/lite|mini|small|nano/i.test(id)) s -= 8
  if (/pro|ultra|argon|argus/i.test(id)) s -= 6
  const v = id.match(/gemini[-_]?v?(\d+(?:\.\d+)?)/) ?? id.match(/(\d+\.\d+)/)
  if (v) s += parseFloat(v[1]) * 10
  if (/^(gemini|z-ai\/)/.test(id)) s += 3
  return s
}

/** Best live model from `models`, excluding `exclude`. Deterministic order. */
export function pickBestModel(models: string[], exclude?: string): string | null {
  const pool = models.filter((m) => m && m !== exclude)
  if (!pool.length) return null
  return [...pool].sort((a, b) => scoreModelId(b) - scoreModelId(a) || a.localeCompare(b))[0]
}

/**
 * List live model IDs from the provider. Primary path is the OpenAI-compatible
 * listing (GET {baseUrl}/models); for Gemini-style endpoints a native
 * {origin}/v1beta/models fallback exists because some keys only see it.
 */
async function fetchModelList(baseUrl: string, apiKey: string): Promise<string[]> {
  try {
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    })
    if (res.ok) {
      const json = (await res.json()) as { data?: { id?: string }[] }
      const ids = (json.data ?? [])
        .map((m) => (typeof m?.id === "string" ? m.id : ""))
        .filter(Boolean)
        .map((id) => id.replace(/^models\//, ""))
      return [...new Set(ids)]
    }
  } catch {
    // fall through to the native path
  }
  const origin = new URL(baseUrl).origin
  if (origin.includes("generativelanguage")) {
    const res = await fetch(`${origin}/v1beta/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(DISCOVERY_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`model discovery failed (${res.status})`)
    const json = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[]
    }
    return (json.models ?? [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean)
  }
  throw new Error("model discovery unavailable for this provider")
}

/** Test hooks: clear per-lambda provider state between scenarios. */
export function _resetDiscoveryCacheForTests(): void {
  discoveryCache = null
  discoveryInflight = null
}

export function _resetQuarantineForTests(): void {
  quarantineUntil = 0
}

/** Populate discoveryCache once per TTL; concurrent callers share one GET.
 *  Returns the live model list (empty when discovery is unavailable). */
async function ensureDiscovery(baseUrl: string, apiKey: string): Promise<string[]> {
  if (discoveryCache && Date.now() - discoveryCache.at < DISCOVERY_TTL_MS) return discoveryCache.models
  if (!discoveryInflight) {
    discoveryInflight = fetchModelList(baseUrl, apiKey)
      .then((models) => {
        discoveryCache = models.length ? { models, at: Date.now() } : null
      })
      .catch(() => {
        discoveryCache = null
      })
      .finally(() => {
        discoveryInflight = null
      })
  }
  await discoveryInflight
  return discoveryCache?.models ?? []
}

interface ModelPlan {
  primary: string
  fallback: string
  /** true when at least one name came from live discovery. */
  discovered: boolean
  /** Number of live models seen by discovery (0 = discovery unavailable/off). */
  discoveredCount: number
}

function configuredModelPlan(): ModelPlan {
  const primary = (process.env.AI_MODEL || DEFAULT_MODEL).trim()
  const fallback = (process.env.AI_MODEL_FALLBACK || "").trim()
  return { primary, fallback: fallback && fallback !== primary ? fallback : "", discovered: false, discoveredCount: 0 }
}

/**
 * Merge the configured plan with live discovery: keep an honored pin, replace
 * retired/unknown pins with the best live model, and backfill the fallback
 * slot from the live list when it is empty or itself retired.
 */
async function resolveModelPlan(baseUrl: string, apiKey: string, budgetMs: number): Promise<ModelPlan> {
  const plan = configuredModelPlan()
  if (budgetMs < MIN_DISCOVERY_BUDGET_MS) return plan
  const models = await ensureDiscovery(baseUrl, apiKey)
  if (!models.length) return plan
  if (!models.includes(plan.primary)) {
    const best = pickBestModel(models)
    if (best) plan.primary = best
  }
  if (!models.includes(plan.fallback)) {
    const alt = pickBestModel(models, plan.primary)
    plan.fallback = alt ?? ""
  }
  if (plan.primary === plan.fallback) plan.fallback = ""
  plan.discovered = true
  plan.discoveredCount = models.length
  return plan
}

/** Provider told us the model itself is gone (retired/renamed) — re-discover. */
function isModelMissingError(status: number, body: string): boolean {
  if (status !== 404 && status !== 400) return false
  return /no longer available|not found|not supported|unsupported|invalid model|decommissioned|does not exist/i.test(body)
}

// ---------- External OpenAI-compatible provider ----------

interface ApiAttempt {
  model: string
  timeoutMs: number
}

/**
 * Attempt plan inside the caller's budget: primary → primary → fallback.
 * The first attempt keeps ~68% of the budget (a real generation needs room);
 * retries get ~13% each (transient 5xx/429 answers arrive in ~2s). The 2s
 * gaps are accounted for, so the plan always fits inside budgetMs.
 */
function buildAttemptPlan(budgetMs: number, models: ModelPlan): ApiAttempt[] {
  const primary = models.primary
  const fallback = models.fallback

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
async function readSseContent(
  res: Response,
  timeoutMs: number
): Promise<{ content: string; raw: string }> {
  if (!res.body) throw new Error("AI provider returned no response body")
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let content = ""
  // Error bodies can arrive labeled text/event-stream, so the content-type
  // gate alone misses them — capture every non-`data:` line for diagnosis and
  // rate-limit detection.
  let raw = ""
  let done = false
  // Hard ceiling on top of the fetch signal so a stalled stream never lingers.
  const deadline = Date.now() + timeoutMs

  // One SSE line. v4.2: JSON error bodies from the provider can be a SINGLE
  // line with no trailing newline — they used to sit in `buffer` and vanish,
  // which made a perfectly-diagnosable rate-limit response look like an
  // "empty stream".
  const processLine = (line: string): void => {
    if (!line) return
    if (!line.startsWith("data:")) {
      if (raw.length < 400) raw += (raw ? "\n" : "") + line
      return
    }
    const data = line.slice(5).trim()
    if (data === "[DONE]") {
      done = true
      return
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

  try {
    while (!done && Date.now() < deadline) {
      const chunk = await reader.read()
      if (chunk.done) break
      buffer += decoder.decode(chunk.value, { stream: true })
      let nl: number
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim()
        buffer = buffer.slice(nl + 1)
        processLine(line)
      }
    }
    // v4.2: flush the trailing line the stream ended without a newline.
    if (buffer.trim()) processLine(buffer.trim())
  } finally {
    reader.cancel().catch(() => {})
  }
  return { content, raw }
}

async function chatViaExternalApi(req: AiChatRequest): Promise<AiChatResult> {
  if (Date.now() < quarantineUntil) {
    throw new Error(
      `AI provider quarantined for ${Math.ceil((quarantineUntil - Date.now()) / 1000)}s after repeated serving hangs — use the fallback`
    )
  }
  const apiKey = (process.env.AI_API_KEY || "").trim()
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, "")
  const budget = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, 120_000)
  const deadline = Date.now() + budget
  const models = await resolveModelPlan(baseUrl, apiKey, budget)
  const plan = buildAttemptPlan(budget, models)

  const messages = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
    ...(req.history ?? []),
  ]

  let lastError = ""
  let patientRetries = 0
  const outcomes: string[] = []
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
        // Gemini 3.x models think by default — on a 40KB+ grounded prompt the
        // reasoning phase alone can outlast the attempt timeout with zero
        // content emitted. reasoning_effort:"low" (OpenAI-compat param, mapped
        // to thinking_level) caps that; other providers ignore or reject the
        // field, so it is only sent where it is known to be accepted.
        body: JSON.stringify({
          model: attempt.model,
          messages,
          temperature: 0.5,
          stream: true,
          ...(baseUrl.includes("generativelanguage") ? { reasoning_effort: "low" } : {}),
        }),
        signal: AbortSignal.timeout(attempt.timeoutMs),
      })

      if (!res.ok) {
        const body = await res.text().catch(() => "")
        lastError = `AI API error ${res.status}: ${body.slice(0, 160)}`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: HTTP ${res.status}`)
        if (PERMANENT_ERROR_RE.test(lastError)) {
          // Bad key / forbidden — no retry or fallback will help.
          throw new Error(lastError)
        }
        if (isModelMissingError(res.status, body)) {
          // Retired/renamed model mid-plan: invalidate discovery and, while
          // budget remains, rewire every remaining attempt to the best live
          // model — the request still completes instead of dying on a 404.
          discoveryCache = null
          if (deadline - Date.now() > MIN_DISCOVERY_BUDGET_MS + ATTEMPT_GAP_MS) {
            const live = await ensureDiscovery(baseUrl, apiKey)
            const best = pickBestModel(live, attempt.model)
            if (best) for (let j = i + 1; j < plan.length; j++) plan[j].model = best
          }
        }
        if (res.status === 404 && i === 0 && plan.length > 1) {
          // Primary model unknown to the provider → jump straight to the last
          // plan slot (skip the useless second primary attempt).
          i = plan.length - 2
        }
        continue
      }

      // v4: non-SSE 200 bodies are provider errors in disguise (Pollinations
      // reports a busy per-IP slot this way). Gate on content-type, log the
      // body preview into the audit trail, and retry patiently on rate-limit.
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("text/event-stream")) {
        const body = await res.text().catch(() => "")
        if (
          /RATE_LIMITED|"status"\s*:\s*429/.test(body.slice(0, 500)) &&
          patientRetries < PATIENT_RETRY_MAX &&
          deadline - Date.now() > PATIENT_RETRY_MIN_REMAINING_MS
        ) {
          patientRetries++
          outcomes.push(
            `${attempt.model}@${attempt.timeoutMs}ms: rate-limited (slot busy) -> patient retry #${patientRetries}`
          )
          await sleep(PATIENT_RETRY_WAIT_MS)
          i--
          continue
        }
        lastError = `AI API error 200 non-SSE: ${body.slice(0, 160)}`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: 200 non-SSE body`)
        continue
      }

      // Accumulate `delta.content` from the SSE stream; `reasoning_content`
      // deltas (GLM reasoning models) are intentionally skipped.
      const { content, raw } = await readSseContent(res, attempt.timeoutMs)
      if (!content.trim()) {
        // v4.2: patient-retry when the body says rate-limit OR when an
        // instant 200 arrives completely empty — from a streaming endpoint
        // both mean the per-IP slot was taken; it frees once the other
        // request finishes, so waiting out a slice of the unused budget
        // recovers the request instead of degrading to rule-based.
        if (
          (raw.trim() === "" || /RATE_LIMITED|"status"\s*:\s*429/.test(raw)) &&
          patientRetries < PATIENT_RETRY_MAX &&
          deadline - Date.now() > PATIENT_RETRY_MIN_REMAINING_MS
        ) {
          patientRetries++
          outcomes.push(
            `${attempt.model}@${attempt.timeoutMs}ms: rate-limited (slot busy) -> patient retry #${patientRetries}`
          )
          await sleep(PATIENT_RETRY_WAIT_MS)
          i--
          continue
        }
        lastError = raw.trim()
          ? `AI API error 200 non-SSE: ${raw.slice(0, 160)}`
          : `empty stream response (model ${attempt.model})`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: ${raw.trim() ? "200 non-SSE body" : "empty stream"}`)
        continue
      }
      return { content, model: attempt.model }
    } catch (e) {
      if (e instanceof Error && PERMANENT_ERROR_RE.test(e.message)) throw e
      const msg = e instanceof Error ? e.message : String(e)
      // Enrich abort/timeout errors with the exact model + attempt shape —
      // this string lands in the AuditLog, so it must be self-explanatory.
      if (/aborted|timed out|timeout/i.test(msg)) {
        lastError = `AI attempt #${i + 1} (model ${attempt.model}, ${attempt.timeoutMs}ms budget) failed: ${msg}`
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: timeout`)
      } else {
        lastError = msg
        outcomes.push(`${attempt.model}@${attempt.timeoutMs}ms: ${msg.slice(0, 60)}`)
      }
    }
  }
  // Full per-attempt chain — the 502 message / audit entry becomes a complete
  // diagnostic (models tried, budgets, failure kinds, discovery state).
  const allHung = outcomes.length > 0 && outcomes.every((o) => o.endsWith(": timeout"))
  if (allHung) quarantineUntil = Date.now() + QUARANTINE_MS
  throw new Error(
    `AI failed after ${outcomes.length}/${plan.length} attempts (discovery:${models.discoveredCount})${allHung ? " — provider quarantined 3min (serving hang)" : ""}: ${outcomes.join("; ")}`
  )
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
