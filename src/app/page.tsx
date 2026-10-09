import { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, Building2, Gauge, ScanSearch, CalendarDays, FileCheck2, Crown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AppFooter } from "@/components/egx/app-footer"
import LandingClient from "./landing-client"

export const metadata: Metadata = {
  title: "EGX Financial Scanner — Discovery & Pattern Detection for Egyptian Stocks",
  description: "Pattern detection for Egyptian Exchange investors — comprehensive financial data from officially published filings. Discover companies by verified financial conditions and changes over time.",
  keywords: ["EGX", "financial scanner", "Egyptian Exchange", "financial analysis", "pattern detection", "البورصة المصرية", "شركات البورصة", "التحليل المالي"],
  openGraph: {
    title: "EGX Financial Scanner",
    description: "Pattern detection for Egyptian Exchange investors — comprehensive financial data from officially published filings.",
    type: "website",
    locale: "en_US",
    alternateLocale: "ar_EG",
    siteName: "EGX Financial Scanner",
  },
  twitter: {
    card: "summary_large_image",
    title: "EGX Financial Scanner",
    description: "Pattern detection for Egyptian Exchange investors — comprehensive financial data from officially published filings.",
  },
  alternates: {
    canonical: "/",
  },
}

export default function HomePage() {
  return <LandingClient />
}
