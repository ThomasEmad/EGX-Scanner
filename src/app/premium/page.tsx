import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import PremiumClient from "./client"

export const metadata: Metadata = {
  title: "Premium — full EGX data, rankings and reports",
  description:
    "Unlock the full EGX Financial Scanner dataset: complete rankings across every sector, print-ready company reports, portfolio tools and advanced data-quality views. Billing is handled manually after a request — no card is stored.",
  keywords: ["EGX premium", "اشتراك البورصة المصرية", "تقارير مالية"],
    alternates: {
      canonical: "/premium",
      languages: { en: "/premium", "ar-EG": "/premium" },
    },
  openGraph: {
    title: "Premium — EGX Financial Scanner",
    description: "Full EGX dataset, complete rankings, print-ready reports and portfolio tools.",
    url: "/premium",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX Financial Scanner Premium" }],
  },
}

export default function PremiumPage() {
  return <PremiumClient />
}
