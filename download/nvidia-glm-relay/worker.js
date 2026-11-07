// Cloudflare Worker — NVIDIA GLM relay (free plan)
// ------------------------------------------------
// Vercel's function egress (AWS ranges for Node, and Vercel Edge network) is
// blocked by NVIDIA's WAF — integrate.api.nvidia.com times out silently from
// every Vercel region/runtime (proven 2026-11-06 with fetch + raw sockets +
// edge runtime probes). Cloudflare Workers egress is NOT blocked, so a 20-line
// worker relays the calls and GLM 5.3-flash works in production unchanged.
//
// Setup (free, ~5 minutes):
//   1. Sign up at https://dash.cloudflare.com (free plan, no credit card).
//   2. Workers & Pages → Create application → Create Worker → name it e.g.
//      "nvidia-glm-relay" → Deploy.
//   3. Click "Edit code", paste THIS file, Deploy.
//   4. Test from a terminal:
//        curl -X POST https://nvidia-glm-relay.<your-subdomain>.workers.dev/v1/chat/completions \
//          -H "Authorization: Bearer nvapi-..." -H "Content-Type: application/json" \
//          -d '{"model":"z-ai/glm-5.3-flash","messages":[{"role":"user","content":"قل: تم"}],"max_tokens":50}'
//   5. Tell the assistant the worker URL — it flips AI_BASE_URL to
//      https://nvidia-glm-relay.<your-subdomain>.workers.dev/v1 and redeploys.
//      No other change is needed: the app sends the NVIDIA key as Bearer, the
//      worker validates the shape and forwards 1:1 (streaming preserved).

const UPSTREAM = "https://integrate.api.nvidia.com";

export default {
  async fetch(request) {
    if (request.method !== "POST") {
      return new Response("POST only\n", { status: 405 });
    }
    const url = new URL(request.url);
    // Only relay the chat-completions path under /v1
    if (!/^\/v1\/chat\/completions\/?$/.test(url.pathname)) {
      return new Response("Not found\n", { status: 404 });
    }
    const auth = request.headers.get("authorization") || "";
    if (!/^Bearer nvapi-[A-Za-z0-9_-]{20,}$/.test(auth)) {
      return new Response("Unauthorized\n", { status: 401 });
    }

    const body = await request.text();
    if (body.length > 2_000_000) {
      return new Response("Payload too large\n", { status: 413 });
    }

    try {
      const upstream = await fetch(`${UPSTREAM}${url.pathname}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: auth,
          Accept: request.headers.get("accept") || "application/json",
        },
        body,
      });
      // Stream the upstream response straight back (SSE works unchanged)
      return new Response(upstream.body, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/json",
          "Cache-Control": "no-store",
          "X-Relay-Upstream-Status": String(upstream.status),
        },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: "RELAY_UPSTREAM_FAILED", message: String(e) }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
  },
};
