"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { api } from "@/lib/client/api"

export default function AdminSubscriptionsPage() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["admin-subscriptions"],
    queryFn: () => fetch("/api/v1/admin/subscriptions").then((r) => (r.ok ? r.json() : Promise.resolve({ subscriptions: [] }))),
  })

  const activate = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/admin/subscriptions/${id}/activate`, { method: "POST" }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
  })

  const cancel = useMutation({
    mutationFn: (id: string) => fetch(`/api/v1/admin/subscriptions/${id}/cancel`, { method: "POST" }).then((r) => (r.ok ? r.json() : Promise.reject(r))),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-subscriptions"] }),
  })

  if (isLoading) return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>

  const subs = data?.subscriptions ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{`Subscriptions`}</h1>
      <div className="grid gap-3">
        {subs.map((s: Record<string, unknown>) => (
          <Card key={s.id as string}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{(s.user as Record<string, unknown>)?.email as string}</span>
                <Badge variant={s.status === "ACTIVE" ? "default" : "secondary"}>{s.status as string}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2 text-xs">
              <span>{(s.plan as Record<string, unknown>)?.name as string}</span>
              <span className="tabular">{s.endDate ? new Date(s.endDate as string).toLocaleDateString() : "—"}</span>
              {s.status !== "ACTIVE" ? (
                <Button size="sm" onClick={() => activate.mutate(s.id as string)} disabled={activate.isPending}>
                  {activate.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Activate"}
                </Button>
              ) : (
                <Button size="sm" variant="outline" onClick={() => cancel.mutate(s.id as string)} disabled={cancel.isPending}>
                  {cancel.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Cancel"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {subs.length === 0 ? <p className="text-sm text-muted-foreground">No subscriptions yet.</p> : null}
      </div>
    </div>
  )
}
