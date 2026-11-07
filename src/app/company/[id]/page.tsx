import { Metadata } from "next"
import { db } from "@/lib/db"
import { siteConfig } from "@/lib/seo-config"
import { safeJsonLd } from "@/lib/safe-json"
import { BreadcrumbSchema } from "@/components/seo/structured-data"
import CompanyPageClient from "./client"

async function findCompany(key: string) {
  return db.company.findFirst({
    where: { OR: [{ id: key }, { ticker: key.toUpperCase() }, { isin: key.toUpperCase() }] },
    select: {
      id: true,
      ticker: true,
      nameEn: true,
      nameAr: true,
      sector: true,
      isin: true,
      industry: true,
      isActive: true,
    },
  })
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const key = decodeURIComponent(id)
  const company = await findCompany(key)

  if (!company) {
    return {
      title: "Company not found",
      description: "The requested company profile could not be found.",
      robots: { index: false, follow: false },
    }
  }

  const name = company.nameAr ? `${company.nameEn} (${company.nameAr})` : company.nameEn
  const title = `${company.ticker} — ${company.nameEn}`
  const description = `${company.ticker} ${name} — ${company.sector} company on the Egyptian Exchange. Financial statements, ratios, rankings, dividends and valuations.`
  const canonical = `/company/${company.ticker}`
  // A profile with no trusted financial value is a thin page: keep it
  // crawlable for discovery but do not ask Google to index it yet.
  const validValues = await db.financialValue.count({
    where: {
      companyId: company.id,
      validationStatus: "VALID",
      report: { deletedAt: null, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
    },
  })
  const hasData = validValues > 0

  return {
    title,
    description,
    keywords: [
      company.ticker,
      company.nameEn,
      ...(company.nameAr ? [company.nameAr] : []),
      company.sector,
      "EGX",
      "Egyptian Exchange",
      "البورصة المصرية",
    ],
    alternates: {
      canonical,
      languages: { en: canonical, "ar-EG": canonical },
    },
    openGraph: {
      title: `${company.ticker} — ${company.nameEn} | Meza`,
      description,
      type: "website",
      locale: "en_US",
      alternateLocale: "ar_EG",
      siteName: siteConfig.name,
      url: canonical,
      images: [{ url: siteConfig.ogImage, width: 1200, height: 630, alt: `${company.ticker} — ${company.nameEn}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: `${company.ticker} — ${company.nameEn}`,
      description,
      images: [siteConfig.ogImage],
    },
    robots: company.isActive && hasData ? { index: true, follow: true } : { index: false, follow: true },
  }
}

export default async function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const key = decodeURIComponent(id)
  const company = await findCompany(key)
  const canonical = company ? `${siteConfig.url}/company/${company.ticker}` : null
  const jsonLd = company
    ? {
        "@context": "https://schema.org",
        "@type": "Corporation",
        name: company.nameEn,
        alternateName: company.nameAr ?? undefined,
        tickerSymbol: company.ticker,
        identifier: company.isin
          ? { "@type": "PropertyValue", propertyID: "ISIN", value: company.isin }
          : undefined,
        description: `${company.ticker} — ${company.nameEn}, Egyptian Exchange (${company.sector}). Published quarterly and annual financials, metrics and events on Meza.`,
        url: canonical,
        mainEntityOfPage: canonical,
      }
    : null
  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      ) : null}
      {company ? (
        <>
          <BreadcrumbSchema
            items={[
              { name: "Home", url: siteConfig.url },
              { name: "Companies", url: `${siteConfig.url}/companies` },
              { name: `${company.ticker} — ${company.nameEn}`, url: canonical! },
            ]}
          />
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              // safeJsonLd: company name/ticker come from the DB — a crafted
              // "</script><script>…" value must not be able to break out here.
              __html: safeJsonLd({
                "@context": "https://schema.org",
                "@type": "FinancialProduct",
                name: `${company.ticker} — ${company.nameEn}`,
                tickerSymbol: company.ticker,
                isin: company.isin,
                description: `${company.ticker} — ${company.nameEn}, Egyptian Exchange (${company.sector}). Published quarterly and annual financials, metrics and events on Meza.`,
                url: canonical,
                potentialAction: {
                  "@type": "SearchAction",
                  target: {
                    "@type": "EntryPoint",
                    urlTemplate: `${siteConfig.url}/company/${company.ticker}`,
                  },
                  queryInput: "required name=ticker_symbol",
                },
                audience: {
                  "@type": "Audience",
                  audienceType: "investor",
                },
                provider: {
                  "@type": "Organization",
                  name: siteConfig.name,
                  url: siteConfig.url,
                },
              } as Record<string, unknown>),
            }}
          />
        </>
      ) : null}
      <CompanyPageClient companyId={company?.id ?? key} />
    </>
  )
}
