"use client"

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { TrendingUp, TrendingDown, Activity, Percent, BarChart3 } from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface KPICardProps {
  title: string
  value: string | number
  change?: { value: number; label: string }
  trend?: "up" | "down" | "neutral"
  icon?: React.ReactNode
  subtitle?: string
}

export function KPICard({
  title,
  value,
  change,
  trend = "neutral",
  icon,
  subtitle,
}: KPICardProps) {
  const { t, lang } = useI18n()

  const trendIcons: Record<string, React.ReactNode> = {
    up: <TrendingUp className="h-4 w-4 text-success" />,
    down: <TrendingDown className="h-4 w-4 text-destructive" />,
    neutral: <Activity className="h-4 w-4 text-muted-foreground" />,
  }

  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"

  return (
    <Card className="border border-border hover:border-primary/50 transition-colors">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2.5">
        <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
        {icon && <div className="p-2 rounded bg-accent text-accent-foreground">{icon}</div>}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular">{value}</div>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        {change && (
          <div className="mt-2 flex items-center gap-1">
            <span className={`text-xs font-medium ${trendColor}`}>
              {trendIcons[trend]}
              {Math.abs(change.value)}%
            </span>
            <span className="text-xs text-muted-foreground">{change.label}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
