import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { authenticateUser, createSession } from "@/lib/auth"
import { audit } from "@/lib/audit"

// POST /api/v1/auth/login
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const email = typeof body?.email === "string" ? body.email.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    if (!email || !password) return Response.json({ error: "EMAIL_AND_PASSWORD_REQUIRED" }, { status: 400 })
    const user = await authenticateUser(email, password)
    if (!user) return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
    const token = createSession(user.id)
    await audit("USER_LOGIN", { actor: user.id, entityType: "User", entityId: user.id, details: `Login ${user.email}` })
    return Response.json({ user: { id: user.id, email: user.email, role: user.role }, token })
  } catch (e) {
    console.error("login error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
