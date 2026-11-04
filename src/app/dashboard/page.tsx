import type { Metadata } from "next"
import DashboardClient from "./client"

// The dashboard is an application surface, not a landing page: keep it out of
// the index so search results land on the crawlable public pages instead.
export const metadata: Metadata = {
  title: "Dashboard",
  robots: { index: false, follow: true },
}

export default function DashboardPage() {
  return <DashboardClient />
}
