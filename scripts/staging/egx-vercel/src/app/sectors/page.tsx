import type { Metadata } from "next"
import { db } from "@/lib/db"
import { SECTORS, SECTOR_AR } from "@/lib/sectors"
import { siteConfig } from "@/lib/seo-config"
import { BreadcrumbSchema } from "@/components/seo/structured-data"
import { SectorsPageShell } from "./sectors-shell"

export const revalidate = 3600

export const metadata: Metadata = {
  title: "EGX Sectors — Companies by Egyptian Exchange Sector",
  description:
    "Browse Egyptian Exchange companies by sector: banks, real estate, industrial, telecom, healthcare, food and more. Audited financial data and company profiles in Arabic and English.",
  keywords: ["EGX sectors", "Egyptian Exchange sectors", "قطاعات البورصة المصرية", "أسهم قطاع البنوك", "أسهم العقارات"],
  alternates: {
    canonical: "/sectors",
    languages: { en: "/sectors", "ar-EG": "/sectors" },
  },
  openGraph: {
    title: "EGX Sectors — Companies by Egyptian Exchange Sector",
    description: "Browse Egyptian Exchange companies by sector with audited financial data.",
    url: "/sectors",
    type: "website",
    images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: "EGX sectors" }],
  },
}

export default async function SectorsPage() {
  const grouped = await db.company.groupBy({
    by: ["sector"],
    where: { isActive: true },
    _count: { _all: true },
  })
  const counts = new Map(grouped.map((g) => [g.sector, g._count._all]))
  const sectors = SECTORS.filter((s) => (counts.get(s) ?? 0) > 0)

  return <SectorsPageShell sectors={sectors} counts={counts} />
}
