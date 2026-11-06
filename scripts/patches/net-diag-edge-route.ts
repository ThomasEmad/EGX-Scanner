import { NextRequest } from "next/server"

// Edge-runtime probe: tests whether NVIDIA is reachable from Vercel's EDGE
// network (different egress infrastructure than Node functions).

export const runtime = "edge"
export const maxDuration = 60

const HOST = "integrate.api.nvidia.com"

async function sha256Hex(value: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

async function guard(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization") ?? ""
  if (!secret) return false
  const provided = auth.replace(/^Bearer\s+/i, "")
  if (!provided) return false
  const [a, b] = await Promise.all([sha256Hex(provided), sha256Hex(secret)])
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export async function GET(req: NextRequest) {
  if (!(await guard(req))) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
  }

  const key = (process.env.AI_API_KEY || "").trim()
  const base = (process.env.AI_BASE_URL || "").replace(/\/+$/, "")
  const model = process.env.AI_MODEL || "z-ai/glm-5.3-flash"
  const body = JSON.stringify({ model, messages: [{ role: "user", content: "قل: تم" }], max_tokens: 40, temperature: 0.2 })

  const t0 = Date.now()
  // NVIDIA fetch — raced against a manual deadline so the function ALWAYS
  // answers within ~12s (AbortSignal.timeout proved unreliable when the
  // connection hangs pre-TLS).
  const nvidiaFetch = (async () => {
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body,
      })
      const txt = await res.text().catch(() => "")
      return { ok: res.ok, status: res.status, ms: Date.now() - t0, sample: txt.slice(0, 160) }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 }
    }
  })()
  const nvidiaDeadline = new Promise<Record<string, unknown>>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "deadline 12s reached without answer (silently dropped)" , ms: Date.now() - t0 }), 12000)
  )
  const nvidia = await Promise.race([nvidiaFetch, nvidiaDeadline])

  const c0 = Date.now()
  const controlFetch = (async () => {
    try {
      const r = await fetch("https://api.github.com/zen", { headers: { "User-Agent": "egx-diag" } })
      return { ok: r.ok, status: r.status, ms: Date.now() - c0 }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - c0 }
    }
  })()
  const controlDeadline = new Promise<Record<string, unknown>>((resolve) =>
    setTimeout(() => resolve({ ok: false, error: "deadline 8s" , ms: Date.now() - c0 }), 8000)
  )
  const control = await Promise.race([controlFetch, controlDeadline])

  return Response.json({ runtime: "edge", region: process.env.VERCEL_REGION ?? "unknown", host: HOST, model, nvidia, control })
}
