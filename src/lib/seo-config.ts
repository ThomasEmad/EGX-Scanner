export const siteConfig = {
  name: "EGX Financial Scanner",
  description:
    "Discover Egyptian Exchange companies by verified financial conditions and changes over time: turnarounds, profit growth, debt reduction, cash flow improvement — with full source traceability.",
  url: "https://egx-scanner.com",
  ogImage: "/og-image.png",
  twitterHandle: "@egxscanner",
  links: {
    homepage: "/",
    companies: "/companies",
    scanners: "/scanners",
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
