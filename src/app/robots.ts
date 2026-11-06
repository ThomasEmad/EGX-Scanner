import type { MetadataRoute } from "next"

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://egx-scanner.com"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/admin",
          "/admin/",
          "/data-quality",
          "/api/",
          "/login",
          "/register",
          "/forgot-password",
          "/dashboard",
          "/watchlist",
          "/portfolio",
          "/company/*/report",
        ],
      },
    ],
    sitemap: `${SITE_URL.replace(/\/$/, "")}/sitemap.xml`,
    host: SITE_URL.replace(/\/$/, ""),
  }
}
