import { NextRequest } from "next/server"
import { exec } from "node:child_process"
import { join } from "node:path"
import { promisify } from "node:util"

const execAsync = promisify(exec)

// POST /api/v1/market/refresh — Manually trigger a market snapshot refresh
// Runs the refresh-market-snapshot.mjs script to fetch latest data from TradingView

export async function POST(_req: NextRequest) {
  try {
    const scriptPath = join(process.cwd(), "scripts", "refresh-market-snapshot.mjs")
    
    const { stdout, stderr } = await execAsync(`node "${scriptPath}"`, {
      timeout: 60_000, // 60 second timeout
      maxBuffer: 1024 * 1024, // 1MB buffer
    })

    if (stderr) {
      console.warn("refresh-market-snapshot stderr:", stderr)
    }

    // Parse the output to get the result
    const result = JSON.parse(stdout.trim().split("\n").pop() ?? "{}")

    return Response.json({
      success: true,
      message: "Market snapshot refreshed successfully",
      data: {
        indices: result.indices,
        movers: result.movers,
        gainers: result.gainers,
        losers: result.losers,
        asOf: result.asOf,
      },
    })
  } catch (e: any) {
    console.error("market-refresh-error", e)
    
    // Check if it's a timeout
    if (e.killed || e.signal === "SIGTERM" || e.message?.includes("timeout")) {
      return Response.json(
        { success: false, error: "Refresh timed out after 60 seconds" },
        { status: 504 }
      )
    }

    return Response.json(
      { success: false, error: e.message ?? "Failed to refresh market snapshot" },
      { status: 500 }
    )
  }
}

// Also support GET for easy testing
export async function GET(_req: NextRequest) {
  return POST(new NextRequest(new URL("/api/v1/market/refresh", "http://localhost"), { method: "POST" }))
}