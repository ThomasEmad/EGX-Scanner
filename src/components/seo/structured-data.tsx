import { siteConfig } from "@/lib/seo-config"
import { safeJsonLd } from "@/lib/safe-json"

export function StructuredData({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // safeJsonLd escapes </script> breakouts — database-sourced strings in
      // the payload must never be able to inject HTML here.
      dangerouslySetInnerHTML={{ __html: safeJsonLd(data) }}
    />
  )
}

export function OrganizationSchema() {
  return (
    <StructuredData
      data={{
        "@context": "https://schema.org",
        "@type": "Organization",
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        logo: `${siteConfig.url}/logo.png`,
        sameAs: [],
        contactPoint: {
          "@type": "ContactPoint",
          contactType: "customer support",
          availableLanguage: ["English", "Arabic"],
        },
      }}
    />
  )
}

export function WebSiteSchema() {
  return (
    <StructuredData
      data={{
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: siteConfig.name,
        description: siteConfig.description,
        url: siteConfig.url,
        inLanguage: ["en", "ar"],
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate: `${siteConfig.url}/?search={search_term_string}`,
          },
          queryInput: "required name=search_term_string",
        },
      }}
    />
  )
}

/** Breadcrumb trail for deep pages (company, sector, rankings). */
export function BreadcrumbSchema({
  items,
}: {
  items: Array<{ name: string; url: string }>
}) {
  return (
    <StructuredData
      data={{
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: items.map((item, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: item.name,
          item: item.url,
        })),
      }}
    />
  )
}
