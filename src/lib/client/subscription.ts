"use client"

import { useQuery } from "@tanstack/react-query"
import { useI18n } from "@/lib/i18n"

export function useSubscription() {
  const { data, isLoading } = useQuery({
    queryKey: ["subscription-me"],
    queryFn: () => fetch("/api/v1/subscription/me").then((r) => (r.ok ? r.json() : { isPremium: false, subscription: null })),
    staleTime: 60000,
  })
  return { isPremium: !!data?.isPremium, subscription: data?.subscription ?? null, isLoading }
}

export function AdSlot(props: { slot: string }) {
  const { isPremium, isLoading } = useSubscription()
  const { lang } = useI18n()
  if (isLoading) return null
  if (isPremium) return null

  const label = lang === "ar" ? "إعلان (" + props.slot + ")" : "Ad slot (" + props.slot + ")"
  return React.createElement("div", {
    className: "flex items-center justify-center rounded-lg border border-dashed p-6 text-xs text-muted-foreground",
  }, label)
}
