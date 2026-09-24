"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useState } from "react"
import { api } from "@/lib/client/api"
import { useI18n } from "@/lib/i18n"

export default function AdminPaymentsPage() {
  const qc = useQueryClient()
  const { t, lang } = useI18n()
  const { data, isLoading } = useQuery({
    queryKey: ["admin-payments"],
    queryFn: () => fetch("/api/v1/admin/payment-requests").then((r) => (r.ok ? r.json() : Promise.resolve({ requests: [] }))),
    refetchInterval: 30_000,
  })

  const [notes, setNotes] = useState<Record<string, string>>({})
  const [durations, setDurations] = useState<Record<string, number>>({})

  const verify = useMutation({
    mutationFn: async ({ id, adminNote, durationDays }: { id: string; adminNote?: string; durationDays?: number }) => {
      const res = await fetch(`/api/v1/admin/payment-requests/${id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": localStorage.getItem("adminToken") ?? "" },
        body: JSON.stringify({ adminNote, durationDays }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payments"] }),
  })

  const reject = useMutation({
    mutationFn: async ({ id, adminNote }: { id: string; adminNote?: string }) => {
      const res = await fetch(`/api/v1/admin/payment-requests/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": localStorage.getItem("adminToken") ?? "" },
        body: JSON.stringify({ adminNote }),
      })
      if (!res.ok) throw new Error((await res.json()).error || "Failed")
      return res.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-payments"] }),
  })

  if (isLoading) return <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>

  const requests = data?.requests ?? []

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">{lang === "ar" ? "طلبات الدفع" : "Payment Requests"}</h1>
      <div className="grid gap-3">
        {requests.map((r: Record<string, unknown>) => (
          <Card key={r.id as string}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm">
                <span>{(r.userEmail as string) ?? r.id}</span>
                <Badge variant={r.status === "VERIFIED" ? "default" : r.status === "REJECTED" ? "destructive" : "secondary"}>
                  {r.status as string}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-medium">{(r.planName as string) ?? "—"}</span>
                <span className="tabular">{(r.amount as number)} {(r.currency as string)}</span>
                <span className="tabular">{new Date(r.createdAt as string).toLocaleString()}</span>
              </div>
              {(r.transactionReference as string) ? (
                <p className="text-muted-foreground">{lang === "ar" ? "مرجع:" : "Ref:"} {r.transactionReference}</p>
              ) : null}
              {(r.status as string) === "PENDING" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    className="h-8 w-24 rounded-md border bg-background px-2 text-xs"
                    placeholder="Days"
                    defaultValue={r.durationDays as number}
                    onChange={(e) => setDurations((prev) => ({ ...prev, [r.id as string]: Number(e.target.value) }))}
                  />
                  <Textarea
                    className="h-8 w-48 text-xs"
                    placeholder={lang === "ar" ? "ملاحظة للمستخدم" : "Note to user"}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [r.id as string]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    onClick={() => verify.mutate({ id: r.id as string, adminNote: notes[r.id as string], durationDays: durations[r.id as string] })}
                    disabled={verify.isPending}
                  >
                    {verify.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : lang === "ar" ? "تفعيل" : "Verify"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => reject.mutate({ id: r.id as string, adminNote: notes[r.id as string] })}
                    disabled={reject.isPending}
                  >
                    {reject.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : lang === "ar" ? "رفض" : "Reject"}
                  </Button>
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">{lang === "ar" ? "ملاحظة:" : "Note:"} {(r.adminNote as string) ?? "—"}</p>
              )}
            </CardContent>
          </Card>
        ))}
        {requests.length === 0 ? <p className="text-sm text-muted-foreground">{lang === "ar" ? "لا توجد طلبات" : "No payment requests"}</p> : null}
      </div>
    </div>
  )
}
