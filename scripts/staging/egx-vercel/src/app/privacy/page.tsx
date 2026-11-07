import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import PrivacyClient from "./privacy-client"

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Meza collects, uses, stores and protects account and usage data, and how to exercise your privacy rights.",
    alternates: {
      canonical: "/privacy",
      languages: { en: "/privacy", "ar-EG": "/privacy" },
    },
  openGraph: {
    title: "Privacy Policy — Meza",
    description: "How we collect, use, store and protect account and usage data.",
    url: "/privacy",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "Meza privacy policy" }],
  },
}

export default function PrivacyPage() {
  return <PrivacyClient />
}
