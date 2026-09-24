"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Crown, Loader2, LogOut, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

export function UserMenu() {
  const qc = useQueryClient()
  const { t, lang } = useI18n()
  const { data: subData, isLoading } = useQuery({
    queryKey: ["subscription-me"],
    queryFn: () => fetch("/api/v1/subscription/me").then((r) => (r.ok ? r.json() : { isPremium: false, subscription: null })),
  })

  const logout = useMutation({
    mutationFn: () => fetch("/api/v1/auth/logout", { method: "POST", headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries()
      window.location.reload()
    },
  })

  const isPremium = !!subData?.isPremium

  if (isLoading) return <Loader2 className="h-4 w-4 animate-spin" />

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <User className="h-4 w-4" />
          {lang === "ar" ? "حسابي" : "My Account"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span>{lang === "ar" ? "الخطة" : "Plan"}</span>
          <Badge variant={isPremium ? "default" : "secondary"}>{isPremium ? (lang === "ar" ? "بريميوم" : "Premium") : (lang === "ar" ? "مجاني" : "Free")}</Badge>
        </div>
        {subData?.subscription?.endDate ? (
          <div className="flex items-center justify-between">
            <span>{lang === "ar" ? "ينتهي في" : "Expires"}</span>
            <span className="tabular">{new Date(subData.subscription.endDate).toLocaleDateString()}</span>
          </div>
        ) : null}
        <Button variant="outline" size="sm" className="w-full" onClick={() => logout.mutate()}>
          <LogOut className="me-1 h-3.5 w-3.5" />
          {lang === "ar" ? "خروج" : "Logout"}
        </Button>
      </CardContent>
    </Card>
  )
}
