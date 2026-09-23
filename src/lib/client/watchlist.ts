"use client"

// Watchlist — client-side starred companies (localStorage-persisted via zustand).
// Read-only public data stays public; a watchlist is a user preference, not
// financial data, so it lives entirely on the client.

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface WatchlistItem {
  id: string
  ticker: string
}

interface WatchlistState {
  items: WatchlistItem[]
  toggle: (item: WatchlistItem) => void
  has: (id: string) => boolean
  clear: () => void
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (item) =>
        set((state) => ({
          items: state.items.some((i) => i.id === item.id)
            ? state.items.filter((i) => i.id !== item.id)
            : [...state.items, item],
        })),
      has: (id) => get().items.some((i) => i.id === id),
      clear: () => set({ items: [] }),
    }),
    { name: "egx-watchlist" }
  )
)
