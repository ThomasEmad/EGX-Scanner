export const siteConfig = {
  name: "EGX Financial Scanner",
  description:
    "Independent financial data for Egyptian Exchange companies — statements, metrics, sector rankings and valuations in Arabic and English.",
  url: process.env.NEXT_PUBLIC_SITE_URL || "https://egx-scanner.com",
  ogImage: "/og-image.png",
  twitterHandle: "@egxscanner",
  links: {
    homepage: "/",
    companies: "/companies",
    sectors: "/sectors",
    scanners: "/dashboard#/scanners",
    premium: "/premium",
  },
}

export const organizationSchema = {
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
}

export const webSiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: siteConfig.name,
  description: siteConfig.description,
  url: siteConfig.url,
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${siteConfig.url}/?search={search_term_string}`,
    },
    queryInput: "required name=search_term_string",
  },
}
