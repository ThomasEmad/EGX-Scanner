import { Metadata } from "next"
import LandingClient from "./landing-client"
import { siteConfig } from "@/lib/seo-config"
import { StructuredData } from "@/components/seo/structured-data"

const faq = [
  {
    q: "Is the data real or estimated?",
    a: "Every figure is checked for period, accounting identity and scale before it enters analytics. Derived values are labelled as derived, and unavailable values show “—” — they are never estimated or invented.",
  },
  {
    q: "What is the difference between Free and Premium?",
    a: "Free includes company browsing, financial statements, public rankings, and comparisons. Premium adds AI-assisted analysis, custom scanners, alerts on detected events, and data export.",
  },
  {
    q: "How can I verify balance sheet accuracy?",
    a: "The platform runs automated accounting checks (for example PBT − tax ≈ net profit) and exposes each value's state: valid, needs review, or quarantined. No unverified figure is presented as fact.",
  },
  {
    q: "Does the site support Arabic?",
    a: "Yes — the interface is bilingual (Arabic/English) with full RTL support. Company names and financial terms are shown in both languages where a reliable translation exists.",
  },
]

export const metadata: Metadata = {
  title: {
    absolute: "EGX Financial Scanner — Egyptian Exchange Financial Data & Rankings",
  },
  description:
    "Independent financial data for Egyptian Exchange companies: statements, ratios, sector rankings and valuations in Arabic and English.",
  keywords: ["EGX", "financial scanner", "Egyptian Exchange", "financial analysis", "pattern detection", "البورصة المصرية", "شركات البورصة", "التحليل المالي"],
    alternates: {
      canonical: "/",
      languages: { en: "/", "ar-EG": "/" },
    },
  openGraph: {
    title: "EGX Financial Scanner — Egyptian Exchange Financial Data & Rankings",
    description:
      "Independent financial data for Egyptian Exchange companies: statements, ratios, sector rankings and valuations.",
    type: "website",
    locale: "en_US",
    alternateLocale: "ar_EG",
    siteName: siteConfig.name,
    url: "/",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX Financial Scanner" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "EGX Financial Scanner",
    description:
      "Independent, audited financial data for Egyptian Exchange companies.",
    images: [siteConfig.ogImage],
  },
}

export default function HomePage() {
  return (
    <>
      <StructuredData
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }}
      />
      <LandingClient />
    </>
  )
}
