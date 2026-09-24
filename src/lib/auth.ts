// User authentication helpers (session-based, stateless tokens).

import { randomUUID } from "node:crypto"
import bcrypt from "bcryptjs"
import { db } from "@/lib/db"

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

const globalForAuth = globalThis as unknown as {
  __egxUserSessions?: Map<string, { userId: string; expiresAt: number }>
}

const sessions = globalForAuth.__egxUserSessions ?? new Map<string, { userId: string; expiresAt: number }>()
globalForAuth.__egxUserSessions = sessions

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
  const ok = await verifyPassword(password, user.passwordHash)
  if (!ok) return null
  return { id: user.id, email: user.email, role: user.role }
}

export function createSession(userId: string): string {
  const token = randomUUID()
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(token, { userId, expiresAt })
  cleanupSessions()
  return token
}

export function getSessionUser(token: string | null): string | null {
  if (!token) return null
  const s = sessions.get(token)
  if (!s) return null
  if (s.expiresAt < Date.now()) {
    sessions.delete(token)
    return null
  }
  return s.userId
}

export function invalidateSession(token: string | null): void {
  if (!token) return
  sessions.delete(token)
}

export function invalidateUserSessions(userId: string): void {
  for (const [token, s] of sessions) {
    if (s.userId === userId) sessions.delete(token)
  }
}

function cleanupSessions(): void {
  const now = Date.now()
  for (const [t, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(t)
  }
}
