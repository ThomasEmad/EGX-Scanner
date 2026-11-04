import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { db } from "@/lib/db"
import { SECTORS, SECTOR_AR } from "@/lib/sectors"
import { siteConfig } from "@/lib/seo-config"
import { BreadcrumbSchema, StructuredData } from "@/components/seo/structured-data"
import { fetchCalcMany } from "@/lib/financial/statement-pref"
import { selectLatestByCompany } from "@/lib/financial/latest-period"
import { moverMap, readMarketSnapshot } from "@/lib/market/snapshot"
import { SectorPageShell } from "./sector-shell"

export const revalidate = 3600

function isSector(value: string): value is (typeof SECTORS)[number] {
  return (SECTORS as readonly string[]).includes(value)
}

export async function generateMetadata({ params }: { params: Promise<{ sector: string }> }): Promise<Metadata> {
  const { sector: raw } = await params
  const sector = decodeURIComponent(raw)
  if (!isSector(sector)) return { title: "Sector not found", robots: { index: false, follow: false } }

  const ar = SECTOR_AR[sector] ?? sector
  const title = `${sector} companies — EGX sector`
  const description = `Egyptian Exchange ${sector} companies (${ar}) with the latest recorded price and verified annual revenue and net profit. Source-traceable data with the period printed for every figure.`

  return {
    title,
    description,
    keywords: [sector, `${sector} EGX`, `${sector} stocks Egypt`, ar, "البورصة المصرية"],
    alternates: {
      canonical: `/sectors/${encodeURIComponent(sector)}`,
      languages: {
        en: `/sectors/${encodeURIComponent(sector)}`,
        "ar-EG": `/sectors/${encodeURIComponent(sector)}`,
      },
    },
    openGraph: {
      title: `${sector} companies — EGX Financial Scanner`,
      description,
      type: "website",
      locale: "en_US",
      alternateLocale: "ar_EG",
      siteName: siteConfig.name,
      url: `/sectors/${encodeURIComponent(sector)}`,
      images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: `${sector} companies on the EGX` }],
    },
    twitter: { card: "summary_large_image", title: `${sector} companies — EGX`, description, images: [siteConfig.ogImage] },
  }
}

export default async function SectorPage({ params }: { params: Promise<{ sector: string }> }) {
  const { sector: raw } = await params
  const sector = decodeURIComponent(raw)
  if (!isSector(sector)) notFound()

  const companies = await db.company.findMany({
    where: { isActive: true, sector },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, industry: true, updatedAt: true },
    orderBy: { ticker: "asc" },
  })

  const ids = companies.map((c) => c.id)
  const [calc, prices] = ids.length
    ? await Promise.all([
        fetchCalcMany(ids, {
          code: { in: ["revenue", "net_profit"] },
          periodType: "ANNUAL",
          valueStatus: "OK",
          value: { not: null },
        }),
        db.marketPrice.findMany({
          where: { companyId: { in: ids } },
          orderBy: { asOf: "desc" },
          select: { companyId: true, price: true, asOf: true },
        }),
      ])
    : [{ filtered: [] }, []]

  const latest = selectLatestByCompany(calc.filtered, ["revenue", "net_profit"])
  const latestMetric = new Map<string, { value: number; periodLabel: string }>()
  for (const [companyId, selection] of latest) {
    for (const code of ["revenue", "net_profit"]) {
      const value = selection.values[code]
      if (value === null || value === undefined) continue
      latestMetric.set(`${companyId}:${code}`, {
        value,
        periodLabel: selection.periods[code]?.label ?? "",
      })
    }
  }

  const latestPrice = new Map<string, { price: number; asOf: Date }>()
  for (const p of prices) {
    if (!latestPrice.has(p.companyId)) latestPrice.set(p.companyId, { price: p.price, asOf: p.asOf })
  }

  // The 15-minute snapshot is fresher than the durable price rows. Use it when
  // available; the table still prints the timestamp so the delay is explicit.
  const snapshot = readMarketSnapshot()
  const movers = moverMap(snapshot)
  const snapshotAsOf = snapshot?.pricesAsOf ?? snapshot?.asOf ?? null
  for (const company of companies) {
    const mover = movers.get(company.ticker.toUpperCase())
    if (!mover) continue
    latestPrice.set(company.id, {
      price: mover.price,
      asOf: snapshotAsOf ? new Date(snapshotAsOf) : new Date(),
    })
  }

  const ar = SECTOR_AR[sector] ?? sector
  const url = `${siteConfig.url}/sectors/${encodeURIComponent(sector)}`

  return (
    <SectorPageShell
      sector={sector}
      ar={ar}
      companies={companies}
      latestMetric={latestMetric}
      latestPrice={latestPrice}
      url={url}
    />
  )
}
