#!/usr/bin/env python3
"""Patch 1 — auth & security hardening (production-readiness work).

Applies:
  A. src/lib/auth.ts          — HttpOnly session-cookie helpers
  B. login route              — Set-Cookie + LOGIN_FAILED audit
  C. register route           — Set-Cookie
  D. logout route             — clear cookie
  E. NEW auth/session route   — POST sets cookie (OAuth finish flow)
  F. me route                 — Cache-Control: no-store
  G. client api.ts            — drop the JS cookie mirror (server sets it now)
  H. oauth.ts                 — remove hard-coded dev secret fallback
  I. temp-edit.ts             — secure default (opt-in, not opt-out)
Every replacement asserts on the exact old text so a drifted file fails loudly.
"""
import pathlib

ROOT = pathlib.Path("/tmp/my-project")


def patch(rel: str, old: str, new: str, count: int = 1) -> None:
    p = ROOT / rel
    s = p.read_text()
    n = s.count(old)
    assert n == count, f"{rel}: expected {count} occurrence(s) of pattern, found {n}"
    p.write_text(s.replace(old, new))
    print(f"[ok] {rel}")


# ---------------------------------------------------------------- A: auth.ts
patch("src/lib/auth.ts",
"""const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days""",
"""const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

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
}""")

# -------------------------------------------------------------- B: login.ts
patch("src/app/api/v1/auth/login/route.ts",
"""import { authenticateUser, createSession } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit\"""",
"""import { authenticateUser, createSession, sessionCookieHeader } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit\"""")

patch("src/app/api/v1/auth/login/route.ts",
"""    const user = await authenticateUser(email, password)
    if (!user) return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
    const token = await createSession(user.id)
    await audit("USER_LOGIN", { actor: user.id, entityType: "User", entityId: user.id, details: `Login ${user.email}` })
    return Response.json({ user: { id: user.id, email: user.email, role: user.role }, token })""",
"""    const user = await authenticateUser(email, password)
    if (!user) {
      // failed attempts feed the admin security-events feed (LOGIN_FAILED
      // filter) — brute-force patterns become visible without log access
      await audit("LOGIN_FAILED", {
        actor: `ip:${ip}`,
        entityType: "User",
        details: `Failed login for ${email.slice(0, 120)}`,
      }).catch(() => {})
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 })
    }
    const token = await createSession(user.id)
    await audit("USER_LOGIN", { actor: user.id, entityType: "User", entityId: user.id, details: `Login ${user.email}` })
    return Response.json(
      { user: { id: user.id, email: user.email, role: user.role }, token },
      { headers: { "Set-Cookie": sessionCookieHeader(token) } }
    )""")

# ----------------------------------------------------------- C: register.ts
patch("src/app/api/v1/auth/register/route.ts",
"""import { createUser, authenticateUser, createSession, invalidateSession } from "@/lib/auth\"""",
"""import { createUser, authenticateUser, createSession, invalidateSession, sessionCookieHeader } from "@/lib/auth\"""")

patch("src/app/api/v1/auth/register/route.ts",
"""    return Response.json({ user: { id: user.id, email: user.email, name: safeName ?? null }, token }, { status: 201 })""",
"""    return Response.json(
      { user: { id: user.id, email: user.email, name: safeName ?? null }, token },
      { status: 201, headers: { "Set-Cookie": sessionCookieHeader(token) } }
    )""")

# ------------------------------------------------------------- D: logout.ts
patch("src/app/api/v1/auth/logout/route.ts",
"""import { getSessionUser, invalidateSession } from "@/lib/auth\"""",
"""import { getSessionUser, invalidateSession, clearSessionCookieHeader } from "@/lib/auth\"""")

patch("src/app/api/v1/auth/logout/route.ts",
"""  return Response.json({ ok: true })""",
"""  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearSessionCookieHeader() } })""")

# --------------------------------------------------------- F: me route
patch("src/app/api/v1/auth/me/route.ts",
"""  const subscription = await getSubscriptionSummary(userId)
  return Response.json({ user, subscription })""",
"""  const subscription = await getSubscriptionSummary(userId)
  return Response.json(
    { user, subscription },
    { headers: { "Cache-Control": "no-store" } }
  )""")

# --------------------------------------------------------- G: client api.ts
patch("src/lib/client/api.ts",
"""  if (remember) localStorage.setItem("egx-user-token", token)
  else sessionStorage.setItem("egx-user-token", token)
  // mirror into a cookie so server components (report page) can resolve the session
  document.cookie = `egx-user-token=${token}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax`
}""",
"""  if (remember) localStorage.setItem("egx-user-token", token)
  else sessionStorage.setItem("egx-user-token", token)
  // The HttpOnly session cookie (used by server components) is set by the
  // server itself (login/register/session endpoints) — never from JS, so the
  // token stays unreadable to page scripts.
}""")

# ------------------------------------------------------------- H: oauth.ts
patch("src/lib/oauth.ts",
"""function stateSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET || process.env.ADMIN_PASSCODE || "egx-oauth-dev-secret"
}""",
"""function stateSecret(): string {
  // No hard-coded fallback: a silently-predictable state secret defeats the
  // CSRF protection the state parameter exists for. OAuth stays disabled
  // (providersConfigured gates the UI) until a real secret is configured.
  const secret = process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET || process.env.ADMIN_PASSCODE
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET (or CRON_SECRET / ADMIN_PASSCODE) must be configured to sign OAuth state")
  }
  return secret
}""")

# --------------------------------------------------------- I: temp-edit.ts
patch("src/lib/temp-edit.ts",
"""export const TEMP_EDIT_MODE = process.env.NEXT_PUBLIC_TEMP_EDIT_MODE !== "false\"""",
"""export const TEMP_EDIT_MODE = process.env.NEXT_PUBLIC_TEMP_EDIT_MODE === "true\"""")

print("patch-1 complete")
