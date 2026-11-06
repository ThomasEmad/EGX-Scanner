// User authentication helpers (session-based, database-backed tokens).

import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"
import { hashToken } from "@/lib/secure-compare"

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// Server components (e.g. the printable report page) resolve the session from
// this cookie. The server — not client JS — sets it (HttpOnly + Secure), so a
// successful XSS can neither read the token nor replay it into the header
// flow. Client JS keeps its localStorage copy for the `x-session-token`
// header used by the client-side data layer.
export const USER_SESSION_COOKIE = "egx-user-token"

/** Set-Cookie value for a fresh session (lifetime matches SESSION_TTL_MS). */
export function sessionCookieHeader(token: string): string {
  return `${USER_SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`
}

/** Set-Cookie value that clears the session cookie. */
export function clearSessionCookieHeader(): string {
  return `${USER_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export async function createUser(email: string, password: string, name?: string): Promise<{ id: string; email: string }> {
  const passwordHash = await hashPassword(password)
  const user = await db.user.create({
    data: {
      email: email.toLowerCase().trim(),
      passwordHash,
      name: name ?? null,
      role: "user",
    },
    select: { id: true, email: true },
  })
  return user
}

export async function authenticateUser(email: string, password: string): Promise<{ id: string; email: string; role: string } | null> {
  const user = await db.user.findUnique({
    where: { email: email.toLowerCase().trim() },
    select: { id: true, email: true, passwordHash: true, role: true, isActive: true },
  })
  if (!user || !user.isActive) return null
  // OAuth-only accounts (Google/Facebook sign-ups) have no local password —
  // they cannot authenticate with email+password until they set one.
  if (!user.passwordHash) return null
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return null
  return { id: user.id, email: user.email, role: user.role }
}

export async function createSession(userId: string): Promise<string> {
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  // Store only the SHA-256 hash of the token (same model as admin sessions) —
  // the raw token lives only in the client's request header.
  await db.session.create({
    data: { userId, token: hashToken(token), expiresAt },
  })
  return token
}

export async function getSessionUser(token: string | null): Promise<string | null> {
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token: hashToken(token) },
    select: { userId: true, expiresAt: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { token: hashToken(token) } }).catch(() => {})
    return null
  }
  return session.userId
}

export async function invalidateSession(token: string | null): Promise<void> {
  if (!token) return
  await db.session.delete({ where: { token: hashToken(token) } }).catch(() => {})
}

export async function invalidateUserSessions(userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } }).catch(() => {})
}

export async function cleanupExpiredSessions(): Promise<void> {
  await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  }).catch(() => {})
}
