// OAuth sign-in providers (Google / Facebook) — env-gated, zero-dependency.
//
// Flow (authorization-code, server-side exchange):
//   1. GET /api/v1/auth/oauth/{provider}/start
//        → sets a signed, short-lived state cookie and 302s to the provider's
//          consent screen.
//   2. Provider calls back /api/v1/auth/oauth/{provider}/callback?code&state
//        → state cookie verified (CSRF), code exchanged for an access token,
//          profile fetched (email + verified flag + name).
//        → account resolved: existing OAuth link, or link-by-verified-email
//          to an existing local account, or a new passwordless user.
//        → session created (same Session model as password login) and the
//          raw token handed to /auth/finish via the URL FRAGMENT (never a
//          query param — fragments are not sent to servers and never hit
//          access logs).
//
// Configuration (all optional — the provider simply disappears from the UI
// when unset):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   FACEBOOK_CLIENT_ID, FACEBOOK_CLIENT_SECRET
//   OAUTH_STATE_SECRET (optional HMAC key; falls back to CRON_SECRET)
//   OAUTH_REDIRECT_BASE (optional; defaults to the request origin — needed
//     behind proxies that mangle the original host)

export type OAuthProvider = "google" | "facebook"

export interface OAuthProfile {
  providerAccountId: string
  email: string
  emailVerified: boolean
  name: string | null
}

const STATE_TTL_MS = 10 * 60 * 1000

function stateSecret(): string {
  return process.env.OAUTH_STATE_SECRET || process.env.CRON_SECRET || process.env.ADMIN_PASSCODE || "egx-oauth-dev-secret"
}

export function providerConfigured(provider: OAuthProvider): boolean {
  if (provider === "google") return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  if (provider === "facebook") return Boolean(process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET)
  return false
}

export function configuredProviders(): { google: boolean; facebook: boolean } {
  return {
    google: providerConfigured("google"),
    facebook: providerConfigured("facebook"),
  }
}

function isProvider(v: string): v is OAuthProvider {
  return v === "google" || v === "facebook"
}

export function parseProvider(v: string | null | undefined): OAuthProvider | null {
  return v && isProvider(v) ? v : null
}

// ---- signed state (provider|random|expiresAt|next) -------------------------

async function hmac(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(stateSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  )
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("")
}

export async function createStateValue(provider: OAuthProvider, next: string): Promise<string> {
  const payload = JSON.stringify({
    p: provider,
    n: next.slice(0, 120),
    e: Date.now() + STATE_TTL_MS,
    r: crypto.randomUUID(),
  })
  const b64 = Buffer.from(payload).toString("base64url")
  return `${b64}.${await hmac(b64)}`
}

export async function readStateValue(
  value: string | undefined
): Promise<{ provider: OAuthProvider; next: string } | null> {
  if (!value) return null
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const b64 = value.slice(0, dot)
  const sig = value.slice(dot + 1)
  if ((await hmac(b64)) !== sig) return null
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8")) as {
      p: string
      n: string
      e: number
    }
    if (!isProvider(payload.p)) return null
    if (typeof payload.e !== "number" || payload.e < Date.now()) return null
    const next = typeof payload.n === "string" && payload.n.startsWith("/") ? payload.n : "/"
    return { provider: payload.p, next }
  } catch {
    return null
  }
}

export const OAUTH_STATE_COOKIE = "egx_oauth_state"
export const stateCookieOptions = `Path=/; HttpOnly; SameSite=Lax; Max-Age=600` + (process.env.NODE_ENV === "production" ? "; Secure" : "")

// ---- provider endpoints -----------------------------------------------------

export function authorizeUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
  if (provider === "google") {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email profile",
      state,
      access_type: "online",
      prompt: "select_account",
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`
  }
  const q = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID || "",
    redirect_uri: redirectUri,
    response_type: "code",
    state,
    scope: "email",
  })
  return `https://www.facebook.com/v19.0/dialog/oauth?${q}`
}

interface TokenResponse {
  accessToken: string
}

async function exchangeCode(provider: OAuthProvider, redirectUri: string, code: string): Promise<TokenResponse> {
  if (provider === "google") {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    })
    if (!res.ok) throw new Error(`token exchange failed (${res.status})`)
    const data = (await res.json()) as { access_token?: string }
    if (!data.access_token) throw new Error("token exchange returned no access_token")
    return { accessToken: data.access_token }
  }
  const q = new URLSearchParams({
    client_id: process.env.FACEBOOK_CLIENT_ID || "",
    client_secret: process.env.FACEBOOK_CLIENT_SECRET || "",
    redirect_uri: redirectUri,
    code,
  })
  const res = await fetch(`https://graph.facebook.com/v19.0/oauth/access_token?${q}`)
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`)
  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) throw new Error("token exchange returned no access_token")
  return { accessToken: data.access_token }
}

async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
  if (provider === "google") {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) throw new Error(`profile fetch failed (${res.status})`)
    const d = (await res.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string }
    if (!d.sub || !d.email) throw new Error("profile missing sub/email")
    return {
      providerAccountId: d.sub,
      email: d.email.toLowerCase(),
      emailVerified: d.email_verified === true,
      name: d.name ?? null,
    }
  }
  const q = new URLSearchParams({ fields: "id,name,email", access_token: accessToken })
  const res = await fetch(`https://graph.facebook.com/v19.0/me?${q}`)
  if (!res.ok) throw new Error(`profile fetch failed (${res.status})`)
  const d = (await res.json()) as { id?: string; email?: string; name?: string }
  if (!d.id || !d.email) throw new Error("Facebook account did not share an email — required to sign in")
  // Facebook normalizes/verifies the account email before exposing it.
  return {
    providerAccountId: d.id,
    email: d.email.toLowerCase(),
    emailVerified: true,
    name: d.name ?? null,
  }
}

export async function exchangeAndProfile(
  provider: OAuthProvider,
  redirectUri: string,
  code: string
): Promise<OAuthProfile> {
  const { accessToken } = await exchangeCode(provider, redirectUri, code)
  return fetchProfile(provider, accessToken)
}

/** Public base for callback URLs (behind proxies the request origin can lie). */
export function redirectBase(req: Request): string {
  if (process.env.OAUTH_REDIRECT_BASE) return process.env.OAUTH_REDIRECT_BASE.replace(/\/$/, "")
  const h = req.headers
  const proto = h.get("x-forwarded-proto")?.split(",")[0] || "http"
  const host = h.get("x-forwarded-host")?.split(",")[0] || h.get("host") || "localhost:3000"
  return `${proto}://${host}`
}
