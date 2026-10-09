import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { authenticateUser, createSession } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

// POST /api/v1/auth/login
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rateLimit = await checkEndpointRateLimit("auth-login", ip)
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many login attempts. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }

    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    if (!email || !password) return Response.json({ error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 })
    const user = await authenticateUser(email, password)
    if (!user) return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
    const token = await createSession(user.id)
    await audit("USER_LOGIN", { actor: user.id, entityType: "User", entityId: user.id, details: `Login ${user.email}` })
    return Response.json({ user: { id: user.id, email: user.email, role: user.role }, token })
  } catch (e) {
    console.error("login error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
