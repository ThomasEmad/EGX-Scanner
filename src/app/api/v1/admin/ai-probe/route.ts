import { NextRequest } from "next/server"
import { isAdmin } from "@/lib/admin-auth"

// POST /api/v1/admin/ai-probe — provider-side connectivity diagnostics for the
// AI chat-completions path. Admin-only. Never returns or logs the API key.
//
// Motivation (2026-11-07): production showed GET {baseUrl}/models succeeding
// (84 live models, self-healing discovery working) while every POST
// /chat/completions timed out — regardless of prompt size — with a key that
// never produced an HTTP status. This probe separates the layers:
//   which:"fake"  — a syntactically-valid but WRONG nvapi-shaped key. If it
//     401s fast, the POST path and the auth edge are reachable from this
//     runtime; if it hangs too, the egress/WAF path itself is broken.
//   which:"real"  — the configured key against a tiny prompt, then sized
//     prompts, isolating inference latency from auth/WAF.

export const maxDuration = 30

const PROBE_TIMEOUT_MS = 22_000

function fakeNvapiKey(): string {
  // Syntactically valid JWT shape (header.payload.signature) with a
  // deliberately wrong signature. NOT a real credential of any kind.
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url")
  return `nvapi-${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "probe", exp: 9999999999 })}.cHJvYmUtZmFrZS1zaWduYXR1cmU`
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 })
  }
  const baseUrl = (
    process.env.AI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/"
  )
    .trim()
    .replace(/\/+$/, "")
  const realKey = (process.env.AI_API_KEY || "").trim()
  const model = (process.env.AI_MODEL || "gemini-3.8-flash").trim()

  const body = (await req.json().catch(() => ({}))) as {
    which?: string
    stream?: boolean
    sizeKB?: number
    model?: string
  }
  const which = body.which === "fake" ? "fake" : "real"
  const stream = Boolean(body.stream)
  const sizeKB = Math.min(Math.max(Number(body.sizeKB) || 0, 0), 200)
  const useModel = typeof body.model === "string" && body.model.trim() ? body.model.trim() : model

  const filler = "lorem ipsum dolor sit amet consectetur adipiscing elit ".repeat(4200)
  const userContent =
    sizeKB > 0
      ? `${filler.slice(0, sizeKB * 1024)}\nReply with the single word OK.`
      : "Reply with the single word OK."

  const payload = {
    model: useModel,
    messages: [{ role: "user", content: userContent }],
    stream,
    max_tokens: 8,
  }
  const key = which === "fake" ? fakeNvapiKey() : realKey
  const started = Date.now()
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    const text = (await res.text()).slice(0, 200)
    return Response.json({
      probe: { which, stream, sizeKB, model: useModel },
      baseUrlHost: new URL(baseUrl).host,
      latencyMs: Date.now() - started,
      status: res.status,
      responseHead: text,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({
      probe: { which, stream, sizeKB, model: useModel },
      baseUrlHost: new URL(baseUrl).host,
      latencyMs: Date.now() - started,
      status: null,
      error: /abort|timeout/i.test(msg) ? "TIMEOUT (no HTTP response within budget)" : msg.slice(0, 200),
    })
  }
}
