#!/usr/bin/env python3
"""Patch 2 — OAuth finish cookie + new auth/session endpoint + instrumentation.

  A. NEW src/app/api/v1/auth/session/route.ts
     POST with x-session-token → validates → Set-Cookie (HttpOnly+Secure).
     Needed because OAuth delivers the token via URL fragment to a client
     page; that page must hand it to the server through a header (never a
     query string) so the server can set the HttpOnly cookie.
  B. src/app/auth/finish/page.tsx — call the session endpoint after verify.
  C. src/instrumentation.ts — boot-time env validation (log-only), global
     unhandledRejection/uncaughtException logging, daily expired-session
     cleanup.
  D. .env — pin NEXT_PUBLIC_TEMP_EDIT_MODE=true (keeps the current editing UX
     while the code default becomes secure-off).
"""
import pathlib

ROOT = pathlib.Path("/tmp/my-project")


def patch(rel: str, old: str, new: str, count: int = 1) -> None:
    p = ROOT / rel
    s = p.read_text()
    n = s.count(old)
    assert n == count, f"{rel}: expected {count} occurrence(s), found {n}"
    p.write_text(s.replace(old, new))
    print(f"[ok] {rel}")


# ------------------------------------------------- A: new session route
session_route = '''import { NextRequest } from "next/server"
import { getSessionUser, sessionCookieHeader } from "@/lib/auth"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"

// POST /api/v1/auth/session
// Body: none. Auth: x-session-token header. Effect: sets the HttpOnly session
// cookie for the caller's existing session — the OAuth finish flow uses this
// (token arrives via URL fragment, which must never travel in a query string).
export async function POST(req: NextRequest) {
  try {
    const rateLimit = await checkEndpointRateLimit("auth-session", getClientIp(req))
    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000)
      return Response.json(
        { error: "RATE_LIMITED", message: "Too many requests. Please try again later.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      )
    }
    const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "") ?? null
    const userId = await getSessionUser(token)
    if (!userId || !token) return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 })
    return Response.json(
      { ok: true },
      { headers: { "Set-Cookie": sessionCookieHeader(token) } }
    )
  } catch (e) {
    console.error("session cookie error", e)
    return Response.json({ error: "INTERNAL_ERROR" }, { status: 500 })
  }
}
'''
sr = ROOT / "src/app/api/v1/auth/session"
sr.mkdir(parents=True, exist_ok=True)
(sr / "route.ts").write_text(session_route)
print("[ok] created src/app/api/v1/auth/session/route.ts")

# ------------------------------------------------- B: finish page calls it
patch("src/app/auth/finish/page.tsx",
"""    fetch("/api/v1/auth/me", { headers: { "x-session-token": token } })
      .then((r) => {
        if (!r.ok) throw new Error("invalid")
        setUserToken(token, true)""",
"""    fetch("/api/v1/auth/me", { headers: { "x-session-token": token } })
      .then((r) => {
        if (!r.ok) throw new Error("invalid")
        setUserToken(token, true)
        // server sets the HttpOnly session cookie (server components depend on it)
        void fetch("/api/v1/auth/session", { method: "POST", headers: { "x-session-token": token } }).catch(() => {})""")

# ------------------------------------------------- C: instrumentation
patch("src/instrumentation.ts",
"""export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return""",
"""export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  // Fail-loud (not fail-crash) config check — a standalone server that boots
  // with a missing ADMIN_PASSCODE would otherwise only fail on first admin
  // login, far from the cause.
  try {
    const { validateEnv } = await import("@/lib/env")
    validateEnv()
  } catch (e) {
    console.error("[boot] MISSING REQUIRED ENV:", e instanceof Error ? e.message : e)
  }

  // Surface silent background failures (SWR refreshers, SSE timers, spawned
  // scripts) — unlogged rejections made production issues undiscoverable.
  process.on("unhandledRejection", (reason) => {
    console.error("[unhandledRejection]", reason instanceof Error ? (reason.stack ?? reason.message) : reason)
  })
  process.on("uncaughtException", (err) => {
    console.error("[uncaughtException]", err?.stack ?? String(err))
  })

  // Expired user sessions accumulate forever without this (rows are only
  // deleted lazily when the exact token is re-presented). Daily is plenty.
  const cleanupSessions = async () => {
    try {
      const { cleanupExpiredSessions } = await import("@/lib/auth")
      await cleanupExpiredSessions()
    } catch {
      // best-effort
    }
  }
  setTimeout(() => void cleanupSessions(), 5 * 60 * 1000).unref?.()
  setInterval(() => void cleanupSessions(), 24 * 60 * 60 * 1000).unref?.()""")

# ------------------------------------------------- D: .env pin
env = ROOT / ".env"
s = env.read_text()
if 'NEXT_PUBLIC_TEMP_EDIT_MODE=' in s:
    s = s.replace('NEXT_PUBLIC_TEMP_EDIT_MODE=', 'NEXT_PUBLIC_TEMP_EDIT_MODE=true')
    env.write_text(s)
    print("[ok] .env NEXT_PUBLIC_TEMP_EDIT_MODE=true")
elif 'NEXT_PUBLIC_TEMP_EDIT_MODE=true' in s:
    print("[skip] .env already true")
else:
    env.write_text(s.rstrip() + "\nNEXT_PUBLIC_TEMP_EDIT_MODE=true\n")
    print("[ok] .env appended")

print("patch-2 complete")
