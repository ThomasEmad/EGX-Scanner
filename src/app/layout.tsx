import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, IBM_Plex_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "./providers";
import { OrganizationSchema, WebSiteSchema } from "@/components/seo/structured-data";

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
  title: {
    default: "EGX Financial Scanner — Discovery & Pattern Detection",
    template: "%s · EGX Financial Scanner",
  },
  description:
    "Discover Egyptian Exchange companies by verified financial conditions and changes over time: turnarounds, profit growth, debt reduction, cash flow improvement — with a factual explanation for every match and comprehensive financial data.",
  keywords: ["EGX", "financial scanner", "Egyptian Exchange", "financial analysis", "pattern detection", "البورصة المصرية", "شركات البورصة", "التحليل المالي"],
  authors: [{ name: "EGX Financial Scanner" }],
  openGraph: {
    title: "EGX Financial Scanner",
    description:
      "Pattern detection for Egyptian Exchange investors — comprehensive financial data from officially published filings.",
    type: "website",
    locale: "en_US",
    alternateLocale: "ar_EG",
    siteName: "EGX Financial Scanner",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "EGX Financial Scanner",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "EGX Financial Scanner",
    description:
      "Pattern detection for Egyptian Exchange investors — comprehensive financial data from officially published filings.",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  alternates: {
    canonical: "/",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
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
        <Providers>{children}</Providers>
        <Toaster />
        <OrganizationSchema />
        <WebSiteSchema />
      </body>
    </html>
  );
}
