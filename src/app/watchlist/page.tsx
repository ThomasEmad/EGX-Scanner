import type { Metadata } from "next"
import WatchlistClient from "./client"

export const metadata: Metadata = {
  title: "Watchlist",
  robots: { index: false, follow: false },
}

export default function WatchlistPage() {
  return <WatchlistClient />
}
