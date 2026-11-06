import type { MetadataRoute } from "next"
import { db } from "@/lib/db"
import { siteConfig } from "@/lib/seo-config"
import { SECTORS } from "@/lib/sectors"

export const revalidate = 3600

const baseUrl = siteConfig.url.replace(/\/$/, "")

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/companies`, lastModified: now, changeFrequency: "daily", priority: 0.95 },
    { url: `${baseUrl}/rankings`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/undervalued`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/sectors`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    // /compare is intentionally noindex (user-selected companies), so it is
    // not advertised here.
    { url: `${baseUrl}/premium`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/about`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/status`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
  ]

  const companies = await db.company.findMany({
    where: { isActive: true },
    select: { id: true, ticker: true, sector: true, updatedAt: true },
    take: 10000,
    orderBy: { ticker: "asc" },
  })

  // A company with no trusted value is a thin page; it stays reachable but is
  // noindex and therefore excluded from the sitemap until data arrives.
  const withData = await db.financialValue.groupBy({
    by: ["companyId"],
    where: {
      companyId: { in: companies.map((c) => c.id) },
      validationStatus: "VALID",
      report: { deletedAt: null, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
    },
    _count: { _all: true },
  })
  const hasData = new Set(withData.filter((r) => r._count._all > 0).map((r) => r.companyId))
  const indexable = companies.filter((c) => hasData.has(c.id))

  const companyPages: MetadataRoute.Sitemap = indexable.map((c) => ({
    url: `${baseUrl}/company/${c.ticker}`,
    lastModified: c.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }))

  // Only sectors that actually have at least one active company, so the
  // sitemap never advertises empty, thin pages.
  const populated = new Set(companies.map((c) => c.sector))
  const sectorPages: MetadataRoute.Sitemap = SECTORS.filter((s) => populated.has(s)).map((sector) => ({
    url: `${baseUrl}/sectors/${encodeURIComponent(sector)}`,
    lastModified: now,
    changeFrequency: "weekly",
    priority: 0.65,
  }))

  return [...staticPages, ...sectorPages, ...companyPages]
}
