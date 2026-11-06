import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import DividendsPageClient from "./page-client"

export const metadata: Metadata = {
  title: "EGX Dividend Calendar — Upcoming Dividend Dates",
  description:
    "Egyptian Exchange dividend calendar: announcement, eligibility, ex-dividend and distribution dates for EGX companies. Every date printed exactly as disclosed.",
  keywords: ["EGX dividends", "Egyptian Exchange dividends", "توزيعات أرباح البورصة", "توزيعات الأسهم المصرية"],
  alternates: {
    canonical: "/dividends",
    languages: { en: "/dividends", "ar-EG": "/dividends" },
  },
  openGraph: {
    title: "EGX Dividend Calendar — EGX Financial Scanner",
    description: "Upcoming dividend dates for Egyptian Exchange companies — announcement, eligibility, ex-date and distribution.",
    url: "/dividends",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX dividend calendar" }],
  },
}

export default function DividendsPage() {
  return <DividendsPageClient />
}
