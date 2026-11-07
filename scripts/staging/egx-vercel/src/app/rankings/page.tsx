import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import RankingsClient from "./client"

export const metadata: Metadata = {
  title: "EGX company rankings — ROE, ROA, P/E, P/B and more",
  description:
    "Rank Egyptian Exchange companies by verified metrics: ROE, ROA, net margin, P/E, P/B, market cap, revenue and net profit. Every row shows its own period, and stale figures are flagged — no shared-period assumptions.",
  keywords: [
    "EGX rankings",
    "Egyptian stock rankings",
    "ROE Egypt",
    "P/E Egyptian stocks",
    "ترتيب الشركات",
    "أسهم البورصة المصرية",
    "العائد على حقوق الملكية",
  ],
    alternates: {
      canonical: "/rankings",
      languages: { en: "/rankings", "ar-EG": "/rankings" },
    },
  openGraph: {
    title: "EGX company rankings — Meza",
    description: "Rank Egyptian Exchange companies by verified financial metrics, with each row's period shown.",
    url: "/rankings",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX company rankings" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EGX company rankings",
    description: "Rank Egyptian Exchange companies by verified financial metrics.",
    images: [siteConfig.ogImage],
  },
}

export default function RankingsPage() {
  return <RankingsClient />
}
