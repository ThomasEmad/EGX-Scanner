import { Metadata } from "next"
import DisclaimerClient from "./disclaimer-client"

export const metadata: Metadata = {
  title: "Disclaimer",
  description: "Important disclaimers about data accuracy, investment risk, and service limitations for EGX Financial Scanner.",
    alternates: {
      canonical: "/disclaimer",
      languages: { en: "/disclaimer", "ar-EG": "/disclaimer" },
    },
}

export default function DisclaimerPage() {
  return <DisclaimerClient />
}
