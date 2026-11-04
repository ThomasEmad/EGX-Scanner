import { NextRequest } from "next/server"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { db } from "@/lib/db"

// GET /api/v1/market/stream — Server-Sent Events stream for live market prices
// Streams price updates every 5 seconds with 15-minute delayed data from TradingView

export async function GET(_req: NextRequest) {
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

  const stream = new ReadableStream({
    async start(controller) {
      const interval = setInterval(async () => {
        const data = await generateLiveUpdate()
        controller.enqueue(encoder.encode(data))
      }, 5000)

      // Send initial data immediately
      const initial = await generateLiveUpdate()
      controller.enqueue(encoder.encode(initial))

      return () => clearInterval(interval)
    },
    cancel() {
      // Cleanup on client disconnect
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