import { Metadata } from "next"
import { db } from "@/lib/db"
import CompanyPageClient from "./client"

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const company = await db.company.findUnique({
    where: { id },
    select: { ticker: true, nameEn: true, nameAr: true, sector: true },
  })

  if (!company) {
    return {
      title: "Company Not Found — EGX Financial Scanner",
      description: "The requested company profile could not be found.",
      robots: { index: false, follow: false },
    }
  }

  const title = `${company.ticker} — ${company.nameEn} · EGX Financial Scanner`
  const description = `${company.sector || "Egyptian Exchange"} company profile for ${company.ticker} (${company.nameEn}). Financial statements, metrics, events, dividends, and comprehensive financial data.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      locale: "en_US",
      alternateLocale: "ar_EG",
      siteName: "EGX Financial Scanner",
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: { index: true, follow: true },
    alternates: {
      canonical: `/company/${id}`,
    },
  }
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // JSON-LD Corporation schema — organic search grounding for every company page
  const company = await db.company.findUnique({
    where: { id },
    select: { ticker: true, nameEn: true, nameAr: true, sector: true, isin: true },
  })
  const jsonLd = company
    ? {
        "@context": "https://schema.org",
        "@type": "Corporation",
        name: company.nameEn,
        alternateName: company.nameAr ?? undefined,
        tickerSymbol: company.ticker,
        identifier: company.isin ?? undefined,
        description: `${company.ticker} — ${company.nameEn}, Egyptian Exchange (${company.sector}). Source-traceable financials, metrics and events on EGX Financial Scanner.`,
        url: `https://egx-scanner.com/company/${id}`,
      }
    : null
  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      ) : null}
      <CompanyPageClient companyId={id} />
    </>
  )
}
