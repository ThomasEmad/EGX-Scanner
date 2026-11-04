import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";
import { OrganizationSchema, WebSiteSchema } from "@/components/seo/structured-data";
import { siteConfig } from "@/lib/seo-config";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const plexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: "EGX Financial Scanner — Egyptian Exchange Financial Data & Rankings",
    template: "%s · EGX Financial Scanner",
  },
  description: siteConfig.description,
  keywords: [
    "EGX",
    "Egyptian Exchange",
    "Egyptian stocks",
    "financial statements Egypt",
    "EGX rankings",
    "stock screener Egypt",
    "financial analysis",
    "البورصة المصرية",
    "أسهم مصر",
    "القوائم المالية",
    "التحليل المالي",
    "ترتيب الشركات",
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: "finance",
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    title: siteConfig.name,
    description: siteConfig.description,
    type: "website",
    locale: "en_US",
    alternateLocale: "ar_EG",
    siteName: siteConfig.name,
    url: "/",
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: "EGX Financial Scanner — audited Egyptian Exchange financial data",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    images: [siteConfig.ogImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      "ar-EG": "/",
    },
  },
  // Canonical URLs are set per page. A global canonical would point every
  // route at "/" and de-index the whole site.
  icons: {
    icon: [{ url: "/logo.svg", type: "image/svg+xml" }],
    apple: [{ url: "/logo.svg" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" dir="ltr" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${plexArabic.variable} antialiased bg-background text-foreground`}
        style={{ fontFamily: "var(--font-geist-sans), var(--font-arabic), ui-sans-serif, system-ui, sans-serif" }}
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:text-primary-foreground"
        >
          Skip to content — تجاوز إلى المحتوى
        </a>
        <Providers>{children}</Providers>
        <Toaster />
        <OrganizationSchema />
        <WebSiteSchema />
      </body>
    </html>
  );
}
