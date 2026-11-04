import type { Metadata } from "next"
import { siteConfig } from "@/lib/seo-config"
import DataQualityClient from "./client"

export const metadata: Metadata = {
  title: "Data quality & integrity — EGX Financial Scanner",
  description:
    "Per-company data quality: accuracy, completeness, freshness and record-integrity scores, certification tier, blocker and coverage-gap counts, and the root causes behind each gap. Missing values are shown as missing, never as zero.",
  keywords: ["data quality", "financial data integrity", "جودة البيانات", "سلامة البيانات المالية"],
    alternates: {
      canonical: "/data-quality",
      languages: { en: "/data-quality", "ar-EG": "/data-quality" },
    },
  openGraph: {
    title: "Data quality & integrity — EGX Financial Scanner",
    description: "Per-company accuracy, completeness, freshness and record-integrity scores with explicit root causes.",
    url: "/data-quality",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX data quality" }],
  },
}

export default function DataQualityPage() {
  return <DataQualityClient />
}
