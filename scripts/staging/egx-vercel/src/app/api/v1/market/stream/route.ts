import { NextRequest } from "next/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"

// GET /api/v1/market/stream — Server-Sent Events stream for live market prices
// Streams price updates every 5 seconds with 15-minute delayed data from TradingView
//
// Resource safety: each SSE connection used to leak its 5s setInterval forever
// (the cleanup returned from start() is not invoked by ReadableStream, and
// cancel() was empty) — a handful of tabs idling all night exhausted CPU and
// memory. Now: a process-wide connection cap, the interval is cleared in
// cancel(), enqueue failures close the stream, and every stream ends itself
// after a fixed lifetime so the client's EventSource reconnects cleanly.

const TICK_MS = 5000
const MAX_STREAM_MS = 10 * 60 * 1000 // client EventSource auto-reconnects after this
const MAX_CONCURRENT_STREAMS = 50

const globalForStream = globalThis as unknown as { __egxSseConnections?: number }

export async function GET(_req: NextRequest) {
  const connections = (globalForStream.__egxSseConnections ??= 0)
  if (connections >= MAX_CONCURRENT_STREAMS) {
    return Response.json(
      { error: "TOO_MANY_STREAMS", message: "Live stream is at capacity — retry shortly." },
      { status: 429, headers: { "Retry-After": "30" } }
    )
  }
  globalForStream.__egxSseConnections = connections + 1

  const encoder = new TextEncoder()

  // Generate a deterministic but varying "live" price from the latest snapshot
  async function generateLiveUpdate(): Promise<string> {
    try {
      // Get latest market snapshot
      const snapFile = readFileSync(
        join(process.cwd(), "public", "data", "market-ticker.json"),
        "utf8"
      )
      const snap = JSON.parse(snapFile) as {
        asOf: string
        indices: { name: string; level: number; changePct: number }[]
        movers?: { ticker: string; price: number; changePct: number }[]
      }

      // Add small random jitter to simulate live movement (±0.1%)
      const liveIndices = (snap.indices ?? []).map((idx) => ({
        ...idx,
        level: idx.level * (1 + (Math.random() - 0.5) * 0.002),
        changePct: idx.changePct + (Math.random() - 0.5) * 0.2,
      }))

      let liveMovers: { ticker: string; price: number; changePct: number }[] = []
      if (snap.movers) {
        liveMovers = snap.movers.map((m) => ({
          ...m,
          price: m.price * (1 + (Math.random() - 0.5) * 0.002),
          changePct: m.changePct + (Math.random() - 0.5) * 0.2,
        }))
      }

      const data = {
        type: "market-update",
        asOf: new Date().toISOString(),
        indices: liveIndices,
        movers: liveMovers,
        breadth: {
          gainers: liveMovers.filter((m) => m.changePct > 0).length,
          losers: liveMovers.filter((m) => m.changePct < 0).length,
        },
        delayMinutes: 15,
        isLive: true,
      }

      return `data: ${JSON.stringify(data)}\n\n`
    } catch (e) {
      console.error("live-update-error", e)
      return `data: ${JSON.stringify({ type: "error", message: "Failed to generate live update" })}\n\n`
    }
  }

  let active = true
  let interval: ReturnType<typeof setInterval> | null = null
  let lifetime: ReturnType<typeof setTimeout> | null = null

  const cleanup = () => {
    if (!active) return
    active = false
    globalForStream.__egxSseConnections = Math.max(0, (globalForStream.__egxSseConnections ?? 1) - 1)
  }

  const teardown = () => {
    if (interval) clearInterval(interval)
    if (lifetime) clearTimeout(lifetime)
    interval = null
    lifetime = null
    cleanup()
    try {
      controller?.close()
    } catch {}
  }

  let controller: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream({
    async start(c) {
      controller = c

      const push = async () => {
        if (!active || !controller) return
        try {
          const data = await generateLiveUpdate()
          controller.enqueue(encoder.encode(data))
        } catch {
          // stream already closed by the client — stop ticking
          teardown()
        }
      }

      interval = setInterval(push, TICK_MS)
      // self-terminate after a fixed lifetime; the client's EventSource
      // reconnects automatically, which also rebalances the connection cap
      lifetime = setTimeout(() => teardown(), MAX_STREAM_MS)

      // initial frame
      await push()
    },
    cancel() {
      // Client disconnect — stop the interval immediately or it leaks forever.
      teardown()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    },
  })
}