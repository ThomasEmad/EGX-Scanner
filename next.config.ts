import type { NextConfig } from "next";

// CSP: `unsafe-eval` is only required by the dev-mode React refresh runtime.
// Production builds run without it, so the shipped policy is stricter.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(isDev ? ["'unsafe-eval'"] : []),
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
].join(" ");

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' https://www.google-analytics.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  // Upgrading http→https on localhost would break `next dev`; only ship it in
  // production (where TLS terminates at the proxy/CDN).
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  // Pin tracing/Turbopack to this project. Without this, Next walks up to the
  // parent folder (which has an unrelated package-lock.json) and warns.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // Type errors must fail the build — `tsc --noEmit` is clean, so this is safe.
  typescript: {
    ignoreBuildErrors: false,
  },
  // Strict mode surfaces unsafe lifecycles and double-invocation bugs early.
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  allowedDevOrigins: [
    "*.space-z.ai",
    "localhost:3000",
    "127.0.0.1:3000",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains; preload",
          },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
