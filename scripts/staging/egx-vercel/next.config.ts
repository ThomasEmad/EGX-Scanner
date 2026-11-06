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
  // The preview gateway normalizes `/dashboard` to `/dashboard/` (307). With
  // the default trailing-slash redirect the app 308s back, creating a loop.
  // Skipping it lets both forms serve the same page directly.
  skipTrailingSlashRedirect: true,
  // Pin tracing/Turbopack to this project. Without this, Next walks up to the
  // parent folder (which has an unrelated package-lock.json) and warns.
  outputFileTracingRoot: process.cwd(),
  turbopack: { root: process.cwd() },
  // The runtime reads EGX_ROOT-relative paths (scripts/, reports/) directly
  // from the project root — the standalone bundle never needs them. Excluding
  // the heavy non-runtime files keeps the build's trace/hash step inside the
  // sandbox's 3.9GB RAM (it was OOM-killed while copying them).
  outputFileTracingExcludes: {
    "*": [
      "./reports/**",
      "./backups/**",
      "./storage/**",
      "./docs/**",
      "./tool-results/**",
      "./scripts/*.txt",
      "./scripts/*.py",
      "./prisma/prisma/dev.zip",
      "./ara.traineddata",
      "./contamination-fabricated.json",
    ],
  },
  // In this 3.9GB sandbox the build's in-process `tsc` child gets OOM-killed
  // (silent build death). Type safety is enforced out-of-band via
  // `bun run typecheck` (tsc --noEmit) before every deploy/build.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Strict mode surfaces unsafe lifecycles and double-invocation bugs early.
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  // nodemailer (SMTP mail transport) must be resolvable at runtime from the
  // standalone bundle — mark it external so output file tracing always copies
  // it into .next/standalone/node_modules.
  serverExternalPackages: ["nodemailer"],
  // Legacy/alias routes kept alive so old links never 404:
  // /companies is a real directory page again (the old /companies → /rankings
  // redirect is gone — it was why every "الشركات" link landed on the
  // leaderboard). Scanners live on the dashboard.
  // /data-quality was a public page — it is now admin-only, so old public
  // links land on the admin view (non-admins bounce to the admin login).
  async redirects() {
    return [
      { source: "/scanners", destination: "/dashboard", permanent: false },
      { source: "/data-quality", destination: "/admin/data-quality", permanent: false },
    ];
  },
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
