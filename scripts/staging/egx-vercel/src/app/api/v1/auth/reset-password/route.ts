import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { hashPassword, invalidateUserSessions } from "@/lib/auth"
import { hashToken } from "@/lib/secure-compare"

// POST /api/v1/auth/reset-password — consume a single-use reset token and set
// a new password. All existing sessions of the user are invalidated (a stolen
// session must not survive a password change). Rate limited per IP.

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("auth-reset-password", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many attempts. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const token = typeof body?.token === "string" ? body.token.trim() : ""
  const password = typeof body?.password === "string" ? body.password : ""

  if (!token) {
    return Response.json({ error: "VALIDATION", message: "Reset token is required" }, { status: 400 })
  }
  if (password.length < 8 || password.length > 72) {
    return Response.json(
      { error: "VALIDATION", message: "Password must be between 8 and 72 characters" },
      { status: 400 }
    )
  }

  const record = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  })

  // one generic answer for every failure shape — no oracle for validity
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    await audit("PASSWORD_RESET_FAILED", {
      actor: ip,
      entityType: "PasswordResetToken",
      details: "Invalid, expired or already-used reset token presented",
    })
    return Response.json(
      { error: "INVALID_TOKEN", message: "This reset link is invalid or has expired. Request a new one." },
      { status: 400 }
    )
  }

  const user = await db.user.findUnique({ where: { id: record.userId }, select: { id: true, email: true, isActive: true } })
  if (!user || !user.isActive) {
    return Response.json({ error: "INVALID_TOKEN", message: "This reset link is invalid or has expired. Request a new one." }, { status: 400 })
  }

  const passwordHash = await hashPassword(password)
  await db.$transaction([
    db.user.update({ where: { id: user.id }, data: { passwordHash, emailVerified: true } }),
    db.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ])
  // every live session dies with the old credential
  await invalidateUserSessions(user.id)
  await audit("PASSWORD_RESET_COMPLETED", {
    actor: user.email,
    entityType: "User",
    entityId: user.id,
    details: "Password reset via single-use token — all sessions invalidated",
  })

  return Response.json({ ok: true })
}
