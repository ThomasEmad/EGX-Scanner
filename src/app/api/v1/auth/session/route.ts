import { NextRequest } from "next/server"
import { getSessionUser, sessionCookieHeader } from "@/lib/auth"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

// POST /api/v1/auth/session
// Body: none. Auth: x-session-token header. Effect: sets the HttpOnly session
// cookie for the caller's existing session — the OAuth finish flow uses this
// (token arrives via URL fragment, which must never travel in a query string).
export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkEndpointRateLimit("auth-session", getClientIp(req))
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many requests. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }
    const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
    const userId = await getSessionUser(token)
    if (!userId || !token) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookieHeader(token) } }
    )
  } catch (e) {
    console.error("session cookie error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
