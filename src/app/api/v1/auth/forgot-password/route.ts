import { db } from "@/lib/db"
import { audit } from "@/lib/audit"

// POST /api/v1/auth/forgot-password — record a reset request.
// Always answers 200 with a generic body (never reveals whether the email
// exists — no user enumeration). This environment has no outbound mail, so the
// request is audit-logged for the administrator to complete manually.

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "VALIDATION", message: "A valid email is required" }, { status: 400 })
  }

  await audit("PASSWORD_RESET_REQUEST", {
    actor: email,
    entityType: "User",
    details: `Password reset requested for ${email} (no mail service in this environment — admin completes manually)`,
  })

  return Response.json({ ok: true })
}
