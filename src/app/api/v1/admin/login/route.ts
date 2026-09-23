import { NextRequest } from "next/server"
import { adminLogin } from "@/lib/admin-auth"
import { audit } from "@/lib/audit"

// POST /api/v1/admin/login — exchange the admin passcode for a session token.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const token = adminLogin(body?.passcode)
  if (!token) {
    await audit("ADMIN_LOGIN_FAILED", { actor: "unknown", details: "Invalid admin passcode" })
    return Response.json({ error: "INVALID_PASSCODE", message: "Invalid admin passcode" }, { status: 401 })
  }
  await audit("ADMIN_LOGIN", { actor: "admin", details: "Admin session started" })
  return Response.json({ token, expiresInHours: 24 })
}
