import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { createUser, authenticateUser, createSession, invalidateSession, sessionCookieHeader } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import { sendWelcomeMail, siteUrlFor } from "@/lib/mail"

// Input policy (server-enforced, mirrors the client form):
//   • email must look like an email and fit RFC length limits
//   • password 8–72 chars — 8 is the minimum worth hashing, 72 is bcrypt's
//     block size (longer input is silently truncated by the hash anyway)
//   • display name capped to keep DB rows small
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 254
const PASSWORD_MIN = 8
const PASSWORD_MAX = 72
const NAME_MAX = 80

// POST /api/v1/auth/register
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateLimit = await checkEndpointRateLimit("auth-register", ip)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many registration attempts. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    const name = typeof body?.name === "string" ? body.name.trim() : undefined
    if (!email || !password) return Response.json({ error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 })
    if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) {
      return Response.json({ error: "VALIDATION", message: "Please provide a valid email address" }, { status: 400 })
    }
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
      return Response.json(
        { error: "VALIDATION", message: `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters` },
        { status: 400 }
      )
    }
    const safeName = name && name.length > NAME_MAX ? name.slice(0, NAME_MAX) : name
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return Response.json({ error: "EMAIL_ALREADY_EXISTS" }, { status: 409 })
    const user = await createUser(email, password, safeName)
    const token = await createSession(user.id)
    await audit("USER_REGISTER", { actor: user.id, entityType: "User", entityId: user.id, details: `Registered ${user.email}` })
    // Welcome email — fire-and-forget, only when a mail provider is configured;
    // must never delay or break the registration response.
    sendWelcomeMail(user.email, safeName ?? null, siteUrlFor(req))
    return Response.json(
      { user: { id: user.id, email: user.email, name: safeName ?? null }, token },
      { status: 201, headers: { "Set-Cookie": sessionCookieHeader(token) } }
    )
  } catch (e) {
    console.error("register error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
