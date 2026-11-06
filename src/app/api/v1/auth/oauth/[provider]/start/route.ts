import { NextRequest } from "next/server"
import {
  OAUTH_STATE_COOKIE,
  authorizeUrl,
  createStateValue,
  parseProvider,
  providerConfigured,
  redirectBase,
  stateCookieOptions,
} from "@/lib/oauth"

// GET /api/v1/auth/oauth/{provider}/start?next=/portfolio
// Kicks off the authorization-code flow: signed state cookie + 302 to the
// provider. `next` is constrained to same-site absolute paths.
export async function GET(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await ctx.params
  const provider = parseProvider(raw)
  if (!provider) {
    return Response.json({ error: "NOT_FOUND", message: "Unknown provider" }, { status: 404 })
  }
  if (!providerConfigured(provider)) {
    return Response.json(
      { error: "PROVIDER_NOT_CONFIGURED", message: "This sign-in provider is not configured" },
      { status: 404 }
    )
  }

  const url = new URL(req.url)
  const rawNext = url.searchParams.get("next") || "/"
  // only same-site paths, never protocol-relative or off-origin
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/"

  const state = await createStateValue(provider, next)
  const redirectUri = `${redirectBase(req)}/api/v1/auth/oauth/${provider}/callback`
  const target = authorizeUrl(provider, redirectUri, state)

  return new Response(null, {
    status: 302,
    headers: {
      Location: target,
      "Set-Cookie": `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; ${stateCookieOptions}`,
      "Cache-Control": "no-store",
    },
  })
}
