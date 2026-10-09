import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { adminLogin, setAdminCookie, clearAdminCookie, getAdminTokenFromRequest } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

// POST /api/v1/admin/login — exchange the admin passcode for a session cookie.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateLimit = await checkEndpointRateLimit("auth-admin-login", ip)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many admin login attempts. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const body = await req.json().catch(() => null)
    const token = await adminLogin(body?.passcode)
    if (!token) {
      await audit("ADMIN_LOGIN_FAILED", { actor: "unknown", details: "Invalid admin passcode" })
      return Response.json({ error: "INVALID_PASSCODE", message: "Invalid admin passcode" }, { status: 401 })
    }

    const session = await db.adminSession.findUnique({
      where: { token },
      select: { expiresAt: true },
    })

    await audit("ADMIN_LOGIN", { actor: "admin", details: "Admin session started" })

    const cookieResponse = setAdminCookie(token, session?.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000))
    return cookieResponse
  } catch (e) {
    console.error("admin login error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}

// POST /api/v1/admin/logout — clear the admin session cookie.
export async function DELETE(req: NextRequest) {
  try {
    const token = getAdminTokenFromRequest(req)
    if (token) {
      await db.adminSession.delete({ where: { token } }).catch(() => {})
      await audit("ADMIN_LOGOUT", { actor: "admin", details: "Admin session ended" })
    }
    return clearAdminCookie()
  } catch (e) {
    console.error("admin logout error", e)
    return clearAdminCookie()
  }
}
