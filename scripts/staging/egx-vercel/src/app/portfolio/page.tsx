import type { Metadata } from "next"
import PortfolioClient from "./client"

export const metadata: Metadata = {
  title: "Portfolio",
  robots: { index: false, follow: false },
}

export default function PortfolioPage() {
  return <PortfolioClient />
}
