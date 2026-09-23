// Lightweight admin gate (demo-grade).
// Public endpoints are read-only. Mutating endpoints (upload / process / approve /
// review actions) require an admin token obtained with the admin passcode.
// NOTE: sessions are in-memory — acceptable for this sandbox deployment; a production
// deployment would use NextAuth.js with proper roles/permissions.

import { randomUUID } from "node:crypto"

const SESSION_TTL_MS = 24 * 60 * 60 * 1000

const globalForAdmin = globalThis as unknown as {
  __egxAdminSessions?: Map<string, number>
}

const sessions = globalForAdmin.__egxAdminSessions ?? new Map<string, number>()
globalForAdmin.__egxAdminSessions = sessions

function passcode(): string {
  return process.env.ADMIN_PASSCODE || "egx-admin"
}

export function adminLogin(input: string | undefined): string | null {
  if (!input || input !== passcode()) return null
  const token = randomUUID()
  sessions.set(token, Date.now() + SESSION_TTL_MS)
  // opportunistic cleanup
  for (const [t, exp] of sessions) if (exp < Date.now()) sessions.delete(t)
  return token
}

export function isAdmin(req: Request): boolean {
  const token = req.headers.get("x-admin-token")
  if (!token) return false
  const exp = sessions.get(token)
  if (!exp) return false
  if (exp < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: "ADMIN_AUTH_REQUIRED", message: "This action requires admin authentication." },
    { status: 401 }
  )
}
