import { NextRequest } from "next/server"
import { execFile } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"
import { isAdmin, unauthorizedResponse } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

const execFileAsync = promisify(execFile)

// POST /api/v1/market/refresh — manually trigger a market snapshot refresh.
//
// Security model (this endpoint spawns a process, so it is admin-only):
//   • admin session cookie required — anonymous calls get 401 (this used to be
//     reachable by anyone, which let any visitor spawn compute and DoS the DB)
//   • fixed argv via execFile — no shell, nothing user-controlled in the command
//   • single-flight lock — concurrent runs would race the SQLite database
//   • rate limited per IP on top of the auth gate
//   • error responses are generic — script stdout/stderr never reach the client

const ROOT = process.env.EGX_ROOT || process.cwd()

const globalForRefresh = globalThis as unknown as { __egxMarketRefreshBusy?: boolean }

async function runRefresh(): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; reason: "timeout" | "failed" }> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [join(ROOT, "scripts", "refresh-market-snapshot.mjs")],
      { timeout: 60_000, maxBuffer: 1024 * 1024, cwd: ROOT }
    )
    let parsed: Record<string, unknown> = {}
    try {
      parsed = JSON.parse(stdout.trim().split("\n").pop() ?? "{}")
    } catch {
      parsed = {}
    }
    return { ok: true, result: parsed }
  } catch (e: unknown) {
    const err = e as { killed?: boolean; signal?: string; message?: string; stderr?: string }
    // Ops-debug trail in the server log only — the client gets a generic error.
    console.warn("market-refresh script failed:", err.message ?? String(e), err.stderr ? `\n${String(err.stderr).slice(-500)}` : "")
    if (err.killed || err.signal === "SIGTERM" || err.message?.includes("timeout")) {
      return { ok: false, reason: "timeout" }
    }
    return { ok: false, reason: "failed" }
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin(req))) return await unauthorizedResponse()

  // Vercel serverless: the refresh spawns a child process against a script
  // that is not part of the serverless bundle — refuse cleanly instead of
  // surfacing an opaque exec failure. Market data stays as imported.
  if (process.env.VERCEL) {
    return Response.json(
      {
        success: false,
        error: "NOT_AVAILABLE_ON_HOSTING",
        message: "Market snapshot refresh is not available on this hosting — market data stays as imported.",
      },
      { status: 501 }
    )
  }

  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("market-refresh", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { success: false, error: "RATE_LIMITED", message: "Too many refresh requests. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  if (globalForRefresh.__egxMarketRefreshBusy) {
    return Response.json(
      { success: false, error: "BUSY", message: "A market refresh is already running — try again in a minute." },
      { status: 409 }
    )
  }

  globalForRefresh.__egxMarketRefreshBusy = true
  try {
    const outcome = await runRefresh()
    if (!outcome.ok) {
      return Response.json(
        {
          success: false,
          error: outcome.reason === "timeout" ? "Refresh timed out after 60 seconds" : "Failed to refresh market snapshot",
        },
        { status: outcome.reason === "timeout" ? 504 : 500 }
      )
    }

    await audit("MARKET_REFRESH", { actor: "admin", entityType: "MarketPrice", details: "Manual market snapshot refresh" })

    const r = outcome.result
    return Response.json({
      success: true,
      message: "Market snapshot refreshed successfully",
      data: { indices: r.indices, movers: r.movers, gainers: r.gainers, losers: r.losers, asOf: r.asOf },
    })
  } finally {
    globalForRefresh.__egxMarketRefreshBusy = false
  }
}

// GET intentionally does not execute anything — refresh must never fire from
// prefetch/crawlers hitting a URL. Only the admin POST triggers a run.
export async function GET() {
  return Response.json(
    { success: false, error: "METHOD_NOT_ALLOWED", message: "Use POST (admin session required)." },
    { status: 405 }
  )
}
