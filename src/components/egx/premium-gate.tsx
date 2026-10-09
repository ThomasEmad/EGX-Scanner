"use client"

import { useRouter } from "next/navigation"
import { Crown, Lock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

interface PremiumGateProps {
  title?: string
  description?: string
  compact?: boolean
}

export function PremiumGate({ title, description, compact = false }: PremiumGateProps) {
  const router = useRouter()
  const { t, lang } = useI18n()

  const defaultTitle = lang === "ar" ? "ميزة متاحة لمشتركي Premium" : "Premium feature"
  const defaultDescription = lang === "ar"
    ? "قم بالترقية إلى Premium للوصول إلى هذه الميزة."
    : "Upgrade to Premium to unlock this feature."

  if (compact) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-muted-foreground/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
        <span>{title ?? defaultTitle}</span>
        <Button size="sm" variant="link" className="h-auto gap-1 px-0 text-xs" onClick={() => router.push("/premium")}>
          <Crown className="h-3 w-3" aria-hidden />
          {lang === "ar" ? "ترقية" : "Upgrade"}
        </Button>
      </div>
    )
  }

  return (
    <Card className="border-dashed border-muted-foreground/40 bg-muted/10">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          {title ?? defaultTitle}
          <Badge variant="outline" className="ml-auto gap-1 border-amber-500/40 text-amber-700">
            <Crown className="h-3 w-3" aria-hidden />
            {lang === "ar" ? "بريميوم" : "Premium"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs text-muted-foreground">
        <p>{description ?? defaultDescription}</p>
        <Button size="sm" className="w-full gap-2" onClick={() => router.push("/premium")}>
          <Crown className="h-4 w-4" aria-hidden />
          {lang === "ar" ? "ترقية إلى Premium" : "Upgrade to Premium"}
        </Button>
      </CardContent>
    </Card>
  )
}
