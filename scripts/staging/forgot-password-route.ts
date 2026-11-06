import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { hashToken } from "@/lib/secure-compare"

// POST /api/v1/auth/forgot-password — issue a single-use password reset token.
//
// Always answers 200 with a generic body (never reveals whether the email
// exists — no user enumeration). This environment has no outbound mail: the
// RAW token is written into the audit log so the administrator can hand it to
// the user over a trusted channel (admin → data quality / audit view). The
// database stores only the SHA-256 hash, 30-minute expiry, single use.
//
// Rate limited (each call writes an audit row — an unthrottled loop would
// spam the audit log and the DB): 3 attempts/hour per IP.

const RESET_TTL_MS = 30 * 60 * 1000

export async function POST(req: Request) {
  const ip = getClientIp(req)
  const rateLimit = await checkEndpointRateLimit("auth-forgot-password", ip)
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
    return Response.json(
      { error: "RATE_LIMITED", message: "Too many reset requests. Please try again later.", retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    )
  }

  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "VALIDATION", message: "A valid email is required" }, { status: 400 })
  }

  const user = await db.user.findUnique({ where: { email }, select: { id: true, isActive: true } })

  if (user && user.isActive) {
    // one live token per user: supersede older ones
    await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } }).catch(() => {})
    const raw = randomUUID() + randomUUID().replace(/-/g, "")
    await db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    })
    await audit("PASSWORD_RESET_REQUEST", {
      actor: email,
      entityType: "User",
      entityId: user.id,
      // No mail service exists in this deployment — the admin completes the
      // delivery manually from the audit view. The token expires in 30
      // minutes and is single-use; the DB stores only its hash.
      details: `Password reset token for ${email} (valid 30 min, single use): ${raw} — deliver via a trusted channel`,
    })
  } else {
    await audit("PASSWORD_RESET_REQUEST", {
      actor: email,
      entityType: "User",
      details: `Password reset requested for unknown/inactive email ${email}`,
    })
  }

  return Response.json({ ok: true })
}
