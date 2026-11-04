import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import AboutClient from "./client"

export const metadata: Metadata = {
  title: "About — independent EGX financial data",
  description:
    "EGX Financial Scanner is an independent platform for Egyptian Exchange financial data: audited statements, calculated ratios, sector rankings and explicit data-quality indicators. Not affiliated with the EGX.",
  keywords: ["about EGX Financial Scanner", "Egyptian Exchange data", "من نحن", "البورصة المصرية"],
    alternates: {
      canonical: "/about",
      languages: { en: "/about", "ar-EG": "/about" },
    },
  openGraph: {
    title: "About EGX Financial Scanner",
    description: "Independent, audited financial data for Egyptian Exchange companies.",
    url: "/about",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "About EGX Financial Scanner" }],
  },
}

export default function AboutPage() {
  return <AboutClient />
}
