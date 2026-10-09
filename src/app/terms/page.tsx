import { Metadata } from "next"
import TermsClient from "./terms-client"

export const metadata: Metadata = {
  title: "Terms of Service — EGX Financial Scanner",
  description: "Terms of service for EGX Financial Scanner.",
}

export default function TermsPage() {
  return <TermsClient />
}
