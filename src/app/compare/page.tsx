import type { Metadata } from "next"
import CompareClient from "./client"

export const metadata: Metadata = {
  title: "Compare EGX companies",
  robots: { index: false, follow: true },
}

export default function ComparePage() {
  return <CompareClient />
}
