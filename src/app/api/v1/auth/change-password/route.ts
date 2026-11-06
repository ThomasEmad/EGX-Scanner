import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getSessionUser, hashPassword, verifyPassword, invalidateUserSessions, USER_SESSION_COOKIE } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/secure-compare"

const PASSWORD_MIN = 8
const PASSWORD_MAX = 72

// POST /api/v1/auth/change-password
// Body: { currentPassword, newPassword }. Auth: x-session-token header.
// Effect: re-authenticates, updates the hash, invalidates every OTHER
// session (the current device stays signed in), audits the change.
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateLimit = await checkEndpointRateLimit("auth-change-password", ip)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many attempts. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
    const userId = await getSessionUser(token)
    if (!userId) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })

    const body = await req.json()
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : ""
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""
    if (!currentPassword || !newPassword) {
      return Response.json({ error: "VALIDATION", message: "Current and new passwords are required." }, { status: 400 })
    }
    if (newPassword.length < PASSWORD_MIN || newPassword.length > PASSWORD_MAX) {
      return Response.json(
        { error: "VALIDATION", message: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters.` },
        { status: 400 }
      )
    }

    const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, email: true, isActive: true } })
    if (!user || !user.isActive) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
    // OAuth-only accounts have no local password yet — treat "current" as
    // unset so they can set one (without knowing a previous password).
    if (user.passwordHash) {
      const ok = await verifyPassword(currentPassword, user.passwordHash)
      if (!ok) {
        await audit("PASSWORD_CHANGE_FAILED", {
          actor: userId,
          entityType: "User",
          entityId: userId,
          details: "Current password incorrect",
        }).catch(() => {})
        return Response.json({ error: "INVALID_CREDENTIALS", message: "Current password is incorrect." }, { status: 403 })
      }
      const same = await verifyPassword(newPassword, user.passwordHash)
      if (same) {
        return Response.json({ error: "VALIDATION", message: "New password must be different from the current one." }, { status: 400 })
      }
    }

    const passwordHash = await hashPassword(newPassword)
    await db.user.update({ where: { id: userId }, data: { passwordHash, emailVerified: true } })
    // kill other devices; keep the caller's session
    if (token) {
      const currentHash = hashToken(token)
      await db.session.deleteMany({ where: { userId, NOT: { token: currentHash } } }).catch(() => {})
    }
    await audit("PASSWORD_CHANGED", {
      actor: userId,
      entityType: "User",
      entityId: userId,
      details: `Password changed for ${user.email} — other sessions invalidated`,
    })
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": token ? `${USER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}` : "" } }
    )
  } catch (e) {
    console.error("change-password error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
