"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/client/api"

/** Shared premium gate: reads the user's subscription once per page. */
export function useSubscriptionGate(): { isPremium: boolean; loading: boolean } {
  const { data, isLoading } = useQuery({
    queryKey: ["my-subscription"],
    queryFn: () => api.subscription(),
    staleTime: 60_000,
    retry: false,
  })
  return { isPremium: !!data?.isPremium, loading: isLoading }
}
