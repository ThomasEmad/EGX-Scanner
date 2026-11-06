import { NextRequest } from "next/server"
import { secureBearerMatch } from "@/lib/secure-compare"
import https from "node:https"

// MINIMAL decisive probe: same host, same request — undici fetch vs raw
// node:https, plus github control. Answers ONE question: does NVIDIA block
// Vercel egress at the IP/routing level, or is it an undici issue?

export const maxDuration = 60

const HOST = "integrate.api.nvidia.com"

function guard(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  return secureBearerMatch(req.headers.get("authorization"), secret)
}

interface RawResult { status?: number; sample?: string; error?: string; ms: number; bytes: number }

function rawHttps(host: string, path: string, body: string | null, headers: Record<string, string>, timeoutMs: number, maxBytes: number): Promise<RawResult> {
  const t0 = Date.now()
  return new Promise<RawResult>((resolve) => {
    const req = https.request(
      { host, servername: host, path, method: body ? "POST" : "GET", headers, timeout: timeoutMs },
      (res) => {
        let bytes = 0
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => {
          bytes += c.length
          if (chunks.length < 32) chunks.push(c)
          if (bytes >= maxBytes) res.destroy()
        })
        res.on("end", () =>
          resolve({ status: res.statusCode, sample: Buffer.concat(chunks).toString("utf8").slice(0, 160), bytes, ms: Date.now() - t0 })
        )
        res.on("close", () => {
          if (bytes >= maxBytes)
            resolve({ status: res.statusCode, sample: Buffer.concat(chunks).toString("utf8").slice(0, 160), bytes, ms: Date.now() - t0 })
        })
        res.on("error", (e) => resolve({ error: `res: ${e.message}`, bytes, ms: Date.now() - t0 }))
      }
    )
    req.on("timeout", () => req.destroy(new Error(`node:https timeout after ${timeoutMs}ms`)))
    req.on("error", (e) => resolve({ error: e.message, ms: Date.now() - t0, bytes: 0 }))
    if (body) req.write(body)
    req.end()
  })
}

export async function GET(req: NextRequest) {
  if (!guard(req)) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })

  const key = (process.env.AI_API_KEY || "").trim()
  const base = (process.env.AI_BASE_URL || "").replace(/\/+$/, "")
  const model = process.env.AI_MODEL || "z-ai/glm-5.3-flash"
  const body = JSON.stringify({ model, messages: [{ role: "user", content: "قل: تم" }], max_tokens: 40, temperature: 0.2 })

  const [fetchProbe, rawProbe, controlRaw] = await Promise.all([
    // undici fetch — the exact call provider.ts makes
    (async () => {
      const t0 = Date.now()
      try {
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body,
          signal: AbortSignal.timeout(20000),
        })
        const txt = await res.text().catch(() => "")
        return { kind: "fetch", status: res.status, ms: Date.now() - t0, sample: txt.slice(0, 120) }
      } catch (e) {
        return { kind: "fetch", error: e instanceof Error ? e.message : String(e), ms: Date.now() - t0 }
      }
    })(),
    rawHttps(HOST, "/v1/chat/completions", body, { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, 20000, 300),
    rawHttps("api.github.com", "/zen", null, { "User-Agent": "egx-diag" }, 10000, 100),
  ])

  return Response.json({ region: process.env.VERCEL_REGION ?? "unknown", host: HOST, model, keyConfigured: Boolean(key), fetchProbe, rawProbe, controlRaw })
}
