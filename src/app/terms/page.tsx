import { Metadata } from "next"
import TermsClient from "./terms-client"

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of service for Meza.",
    alternates: {
      canonical: "/terms",
      languages: { en: "/terms", "ar-EG": "/terms" },
    },
}

export default function TermsPage() {
  return <TermsClient />
}
