import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { createSession } from "@/lib/auth"
import { hashToken } from "@/lib/secure-compare"
import { audit } from "@/lib/audit"
import { checkEndpointRateLimit, getClientIp } from "@/lib/rate-limit"
import {
  OAUTH_STATE_COOKIE,
  exchangeAndProfile,
  parseProvider,
  providerConfigured,
  readStateValue,
  redirectBase,
  type OAuthProfile,
} from "@/lib/oauth"

// GET /api/v1/auth/oauth/{provider}/callback?code=&state=
//
// Security model:
//   • state cookie must exist, be signed, unexpired, and match ?state (CSRF).
//   • the flow is rate-limited per IP (callback does a token exchange — an
//     unthrottled loop would hammer the provider and the DB).
//   • emails are linked ONLY when the provider vouches for them
//     (Google email_verified, or Facebook which verifies account emails);
//     otherwise a conflicting local email never gets merged silently.
//   • the session token travels back in the URL FRAGMENT of /auth/finish so
//     it never reaches any server access log.
//
// Every terminal branch redirects (never JSON) so the browser always lands
// somewhere meaningful — /auth/finish interprets ?error= codes.

function finishRedirect(params: { token?: string; next?: string; error?: string }): Response {
  const q = new URLSearchParams()
  if (params.error) q.set("error", params.error)
  const next = params.next && params.next.startsWith("/") && !params.next.startsWith("//") ? params.next : "/"
  q.set("next", next)
  const fragment = params.token ? `#token=${encodeURIComponent(params.token)}` : ""
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/auth/finish?${q}${fragment}`,
      // consume the state cookie on any terminal branch
      "Set-Cookie": `${OAUTH_STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
      "Cache-Control": "no-store",
    },
  })
}

async function resolveAccount(profile: OAuthProfile, provider: string): Promise<
  { ok: true; userId: string; created: boolean } | { ok: false; error: string }
> {
  // 1) existing provider link
  const link = await db.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId: profile.providerAccountId } },
    select: { userId: true },
  })
  if (link) {
    const user = await db.user.findUnique({ where: { id: link.userId }, select: { id: true, isActive: true } })
    if (!user || !user.isActive) return { ok: false, error: "account_disabled" }
    return { ok: true, userId: user.id, created: false }
  }

  // 2) same email — link when verified, otherwise refuse (no silent merge)
  const existing = await db.user.findUnique({ where: { email: profile.email }, select: { id: true, isActive: true } })
  if (existing) {
    if (!existing.isActive) return { ok: false, error: "account_disabled" }
    if (!profile.emailVerified) return { ok: false, error: "email_not_verified" }
    await db.oAuthAccount.create({
      data: { userId: existing.id, provider, providerAccountId: profile.providerAccountId },
    })
    return { ok: true, userId: existing.id, created: false }
  }

  // 3) brand-new passwordless account
  if (!profile.emailVerified) return { ok: false, error: "email_not_verified" }
  const user = await db.user.create({
    data: {
      email: profile.email,
      passwordHash: null,
      name: profile.name,
      emailVerified: true,
      role: "user",
    },
    select: { id: true },
  })
  await db.oAuthAccount.create({
    data: { userId: user.id, provider, providerAccountId: profile.providerAccountId },
  })
  return { ok: true, userId: user.id, created: true }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params
  const provider = parseProvider(raw)
  if (!provider || !providerConfigured(provider)) return finishRedirect({ error: "provider_unavailable" })

  const ip = getClientIp(req)
  const rl = await checkEndpointRateLimit("auth-oauth-callback", ip)
  if (!rl.allowed) return finishRedirect({ error: "rate_limited" })

  const url = new URL(req.url)
  const providerState = url.searchParams.get("state")
  const code = url.searchParams.get("code")
  const cookieState = req.cookies.get(OAUTH_STATE_COOKIE)?.value

  // provider-reported error (user denied consent etc.)
  const providerError = url.searchParams.get("error")
  if (providerError) return finishRedirect({ error: "consent_denied" })

  const verified = await readStateValue(providerState)
  if (!code || !verified || !cookieState || cookieState !== providerState || verified.provider !== provider) {
    return finishRedirect({ error: "invalid_state" })
  }

  let profile: OAuthProfile
  try {
    profile = await exchangeAndProfile(provider, `${redirectBase(req)}/api/v1/auth/oauth/${provider}/callback`, code)
  } catch {
    return finishRedirect({ error: "exchange_failed" })
  }

  let account: Awaited<ReturnType<typeof resolveAccount>>
  try {
    account = await resolveAccount(profile, provider)
  } catch {
    return finishRedirect({ error: "account_error" })
  }
  if (!account.ok) return finishRedirect({ error: account.error })

  // best-effort profile refresh on the linked account
  if (profile.name) {
    await db.user
      .update({ where: { id: account.userId }, data: { name: profile.name, emailVerified: true } })
      .catch(() => {})
  }

  const token = await createSession(account.userId)
  await audit(account.created ? "OAUTH_SIGNUP" : "OAUTH_LOGIN", {
    actor: profile.email,
    entityType: "User",
    entityId: account.userId,
    details: `${provider} sign-in (${profile.email})${account.created ? " — account created" : ""}`,
  })

  // reuse-check: the just-created session exists (defensive; createSession is authoritative)
  const sessionOk = await db.session
    .findUnique({ where: { token: hashToken(token) }, select: { id: true } })
    .catch(() => null)

  if (!sessionOk) return finishRedirect({ error: "session_error" })

  return finishRedirect({ token, next: verified.next })
}
