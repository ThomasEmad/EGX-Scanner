import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import UndervaluedClient from "./client"

export const metadata: Metadata = {
  title: "Undervalued EGX stocks — valuation signals with stated criteria",
  description:
    "Egyptian Exchange companies that meet explicit valuation criteria — P/E below the sector median, price below book value, dividend yield in the sector's top quartile, and more. Each candidate lists the criteria it met; nothing is presented as a recommendation.",
  keywords: [
    "undervalued EGX stocks",
    "Egyptian stocks valuation",
    "P/E below sector",
    "أسهم مقومة بأقل من قيمتها",
    "تقييم أسهم البورصة المصرية",
  ],
    alternates: {
      canonical: "/undervalued",
      languages: { en: "/undervalued", "ar-EG": "/undervalued" },
    },
  openGraph: {
    title: "Undervalued EGX stocks — EGX Financial Scanner",
    description: "EGX companies meeting explicit, stated valuation criteria — with the criteria shown per company.",
    url: "/undervalued",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "Undervalued EGX stocks" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Undervalued EGX stocks",
    description: "EGX companies meeting explicit valuation criteria, with the criteria shown per company.",
    images: [siteConfig.ogImage],
  },
}

export default function UndervaluedPage() {
  return <UndervaluedClient />
}
