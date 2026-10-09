import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { createUser, authenticateUser, createSession, invalidateSession } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

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
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) return Response.json({ error: "EMAIL_ALREADY_EXISTS" }, { status: 409 })
    const user = await createUser(email, password, name)
    const token = await createSession(user.id)
    await audit("USER_REGISTER", { actor: user.id, entityType: "User", entityId: user.id, details: `Registered ${user.email}` })
    return Response.json({ user: { id: user.id, email: user.email, name: name ?? null }, token }, { status: 201 })
  } catch (e) {
    console.error("register error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
