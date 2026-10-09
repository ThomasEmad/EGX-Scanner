// Admin authentication gate.
// Sessions are database-backed and stored in HttpOnly Secure SameSite cookies.

import { randomUUID } from "node:crypto"
import { db } from "@/lib/db"

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const COOKIE_NAME = "egx_admin_session"
const COOKIE_PATH = "/"

function passcode(): string {
  const envPasscode = process.env.ADMIN_PASSCODE
  if (!envPasscode) {
    throw new Error("ADMIN_PASSCODE environment variable is not set")
  }
  return envPasscode
}

export async function adminLogin(input: string | undefined): Promise<string | null> {
  if (!input || input !== passcode()) return null
  const token = randomUUID()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.adminSession.create({
    data: { token, expiresAt },
  })
  return token
}

export async function isAdmin(req: Request): Promise<boolean> {
  const token = getAdminTokenFromRequest(req)
  if (!token) return false
  const session = await db.adminSession.findUnique({
    where: { token },
    select: { expiresAt: true },
  })
  if (!session) return false
  if (session.expiresAt < new Date()) {
    await db.adminSession.delete({ where: { token } }).catch(() => {})
    return false
  }
  return true
}

export function getAdminTokenFromRequest(req: Request): string | null {
  const cookieHeader = req.headers.get("cookie")
  if (!cookieHeader) return null
  const cookies = cookieHeader.split(";").map((c) => c.trim().split("="))
  for (const [name, value] of cookies) {
    if (name === COOKIE_NAME) return decodeURIComponent(value)
  }
  return null
}

export function setAdminCookie(token: string, expiresAt: Date): Response {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
  const cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    `Path=${COOKIE_PATH}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Max-Age=${maxAge}`,
    `Expires=${expiresAt.toUTCString()}`,
  ].join("; ")
  return new Response(null, {
    headers: {
      "Set-Cookie": cookie,
    },
  })
}

export function clearAdminCookie(): Response {
  const cookie = [
    `${COOKIE_NAME}=`,
    `Path=${COOKIE_PATH}`,
    `HttpOnly`,
    `Secure`,
    `SameSite=Strict`,
    `Max-Age=0`,
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT`,
  ].join("; ")
  return new Response(null, {
    headers: {
      "Set-Cookie": cookie,
    },
  })
}

export async function unauthorizedResponse(): Promise<Response> {
  return Response.json(
    { error: "ADMIN_AUTH_REQUIRED", message: "This action requires admin authentication." },
    { status: 401 }
  )
}
