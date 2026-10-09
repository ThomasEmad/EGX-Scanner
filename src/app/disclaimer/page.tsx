import { Metadata } from "next"
import DisclaimerClient from "./disclaimer-client"

export const metadata: Metadata = {
  title: "Disclaimer — EGX Financial Scanner",
  description: "Important disclaimers about data accuracy, investment risk, and service limitations for EGX Financial Scanner.",
}

export default function DisclaimerPage() {
  return <DisclaimerClient />
}
