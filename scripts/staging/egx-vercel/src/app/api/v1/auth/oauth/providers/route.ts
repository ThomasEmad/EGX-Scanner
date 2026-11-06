import { configuredProviders } from "@/lib/oauth"

// GET /api/v1/auth/oauth/providers — which social sign-in providers are
// configured on this deployment. Unconfigured providers are hidden from the
// UI; no capabilities are leaked.
export async function GET() {
  return Response.json(configuredProviders(), {
    headers: { "Cache-Control": "public, max-age=300" },
  })
}
