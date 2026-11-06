"use client"

// Watchlist — client-side starred companies (localStorage-persisted via zustand).
// Read-only public data stays public; a watchlist is a user preference, not
// financial data, so it lives entirely on the client.

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { authHeaders, getUserToken } from "@/lib/client/api"

interface WatchlistItem {
  id: string
  ticker: string
}

interface WatchlistState {
  items: WatchlistItem[]
  toggle: (item: WatchlistItem) => void
  has: (id: string) => boolean
  clear: () => void
  /** Login-time two-way merge: server items join the local list, then the
   *  union is pushed back so every device converges on the same list. */
  syncFromServer: () => Promise<void>
}

export const useWatchlist = create<WatchlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (item) => {
        const adding = !get().items.some((i) => i.id === item.id)
        set((state) => ({
          items: !adding ? state.items.filter((i) => i.id !== item.id) : [...state.items, item],
        }))
        // signed-in mirror: fire-and-forget — the localStorage list keeps
        // working offline; the server copy catches up when a request lands.
        if (getUserToken()) {
          void fetch("/api/v1/watchlist/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ companyId: item.id, action: adding ? "add" : "remove" }),
          }).catch(() => {})
        }
      },
      has: (id) => get().items.some((i) => i.id === id),
      clear: () => set({ items: [] }),
      syncFromServer: async () => {
        if (!getUserToken()) return
        try {
          const r = await fetch("/api/v1/watchlist/sync", { headers: authHeaders() })
          if (!r.ok) return
          const { ids } = (await r.json()) as { ids: string[] }
          const current = get().items
          const known = new Set(current.map((i) => i.id))
          const missing = (ids ?? []).filter((id) => !known.has(id))
          let additions: WatchlistItem[] = []
          if (missing.length > 0) {
            const r2 = await fetch(`/api/v1/companies?ids=${missing.join(",")}&pageSize=50`)
            if (r2.ok) {
              const data = (await r2.json()) as { companies?: { id: string; ticker: string }[] }
              additions = (data.companies ?? []).map((c) => ({ id: c.id, ticker: c.ticker }))
            }
          }
          const merged = [...current, ...additions]
          set({ items: merged })
          await fetch("/api/v1/watchlist/sync", {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ ids: merged.map((i) => i.id) }),
          })
        } catch {
          // offline / session died — the local list keeps working
        }
      },
    }),
    { name: "egx-watchlist" }
  )
)
