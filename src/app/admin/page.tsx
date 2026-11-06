"use client"

import { useQuery } from "@tanstack/react-query"
import { ShieldCheck,
  Activity,
  Building2,
  ClipboardCheck,
  FileWarning,
  Boxes,
  ShieldAlert,
  ArrowUpRight,
 } from "lucide-react"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useI18n } from "@/lib/i18n"

// /admin — overview landing page. Data comes from the admin-only
// /api/v1/admin/dashboard endpoint; access is already gated by the layout
// (non-admins are redirected to /admin/login before this page renders).

interface DashboardStats {
  pendingReview: number
  pendingReports: number
  companies: number
  activeCompanies: number
  events: number
  reportsByStatus: Record<string, number>
  valuesByStatus: Record<string, number>
  metricsByStatus: Record<string, number>
  lastAuditRun: {
    startedAt: string
    endedAt: string | null
    durationSec: number | null
    companiesChecked: number | null
    issuesFound: number | null
  } | null
  recentLog: {
    id: string
    actor: string
    action: string
    entityType: string
    entityId: string | null
    details: string | null
    createdAt: string
  }[]
}

const STATUS_AR: Record<string, string> = {
  NEW_DOWNLOADED: "تم التحميل",
  EXTRACTED: "تم الاستخراج",
  VALIDATED: "تم التحقق",
  APPROVED: "معتمد",
  NEEDS_REVIEW: "يحتاج مراجعة",
  REJECTED: "مرفوض",
  VALID: "سليم",
  INVALID: "غير سليم",
  OK: "سليم",
  ERROR: "خطأ",
  PENDING: "معلّق",
  MISSING: "ناقص",
  APPROXIMATED: "تقديري",
}

function fmtWhen(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
}

function StatusBadgeGrid({ map }: { map: Record<string, number> }) {
  const entries = Object.entries(map)
  if (entries.length === 0) return <p className="text-xs text-muted-foreground">—</p>
  return (
    <div className="flex flex-wrap gap-1.5">
      {entries.map(([status, count]) => (
        <Badge
          key={status}
          variant={status === "APPROVED" || status === "VALID" || status === "OK" ? "default" : "outline"}
          className="text-[10px] gap-1 font-mono"
          title={status}
        >
          {STATUS_AR[status] ?? status}
          <span className="font-bold">{count}</span>
        </Badge>
      ))}
    </div>
  )
}

export default function AdminOverviewPage() {
  const { lang } = useI18n()
  const ar = lang === "ar"

  const { data, isLoading } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () =>
      fetch("/api/v1/admin/dashboard", { credentials: "include" }).then((r) =>
        r.ok ? (r.json() as Promise<{ stats: DashboardStats }>) : null
      ),
    refetchInterval: 60_000,
  })

  const stats = data?.stats

  if (isLoading || !stats) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-muted/40" />
        ))}
      </div>
    )
  }

  const cards = [
    {
      title: ar ? "الشركات" : "Companies",
      value: stats.companies,
      sub: ar ? `${stats.activeCompanies} نشِطة` : `${stats.activeCompanies} active`,
      icon: <Building2 className="h-4 w-4" />,
    },
    {
      title: ar ? "قيم تنتظر المراجعة" : "Values pending review",
      value: stats.pendingReview,
      sub: ar ? "قيم مالية بحالة NEEDS_REVIEW" : "financial values with NEEDS_REVIEW",
      icon: <ClipboardCheck className="h-4 w-4" />,
    },
    {
      title: ar ? "تقارير غير معالجة" : "Reports pending",
      sub: ar ? "تحميل أو استخراج غير مكتمل" : "download/extraction not finished",
      value: stats.pendingReports,
      icon: <FileWarning className="h-4 w-4" />,
    },
    {
      title: ar ? "الأحداث المكتشفة" : "Detected events",
      value: stats.events,
      sub: ar ? "أحداث مالية عبر كل الفترات" : "financial events across periods",
      icon: <Boxes className="h-4 w-4" />,
    },
  ]

  return (
    <div className="space-y-5">
      {/* stat cards */}
      <div className="grid gap-4 md:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.title} className="border border-border hover:border-primary/50 transition-colors">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{c.title}</CardTitle>
              <div className="p-2 rounded bg-accent text-accent-foreground">{c.icon}</div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold tabular">{c.value}</p>
              <p className="text-[11px] text-muted-foreground">{c.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* pipeline status */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{ar ? "حالة التقارير" : "Reports by status"}</CardTitle>
          </CardHeader>
          <CardContent><StatusBadgeGrid map={stats.reportsByStatus} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{ar ? "حالة القيم المستخرجة" : "Values by validation"}</CardTitle>
          </CardHeader>
          <CardContent><StatusBadgeGrid map={stats.valuesByStatus} /></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{ar ? "حالة المقاييس المحسوبة" : "Calculated metrics"}</CardTitle>
          </CardHeader>
          <CardContent><StatusBadgeGrid map={stats.metricsByStatus} /></CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* last audit */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">{ar ? "آخر تدقيق بيانات" : "Last data audit"}</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            {stats.lastAuditRun ? (
              <>
                <p className="text-xs text-muted-foreground">{fmtWhen(stats.lastAuditRun.startedAt)}</p>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <span>
                    {ar ? "المدة:" : "Duration:"}{" "}
                    <b className="tabular">{stats.lastAuditRun.durationSec ?? "—"}s</b>
                  </span>
                  <span>
                    {ar ? "شركات:" : "Companies:"}{" "}
                    <b className="tabular">{stats.lastAuditRun.companiesChecked ?? "—"}</b>
                  </span>
                  <span>
                    {ar ? "ملاحظات:" : "Issues:"}{" "}
                    <b className="tabular">{stats.lastAuditRun.issuesFound ?? "—"}</b>
                  </span>
                </div>
                <Link
                  href="/admin/data-quality"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  {ar ? "فتح تقرير الجودة" : "Open quality report"}
                  <ArrowUpRight className="h-3 w-3" />
                </Link>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{ar ? "لا يوجد تدقيق بعد." : "No audit run yet."}</p>
            )}
          </CardContent>
        </Card>

        {/* recent activity */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm">{ar ? "النشاط الأخير" : "Recent activity"}</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {stats.recentLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">{ar ? "لا يوجد نشاط." : "No activity yet."}</p>
            ) : (
              <ul className="space-y-2">
                {stats.recentLog.map((l) => (
                  <li key={l.id} className="flex items-start gap-2 text-xs">
                    <Badge variant="outline" className="shrink-0 font-mono text-[9px]">{l.action}</Badge>
                    <div className="min-w-0">
                      <p className="truncate text-muted-foreground" title={l.details ?? undefined}>
                        {l.details ?? `${l.entityType} ${l.entityId ?? ""}`}
                      </p>
                      <p className="text-[10px] text-muted-foreground/70">
                        {l.actor} · {fmtWhen(l.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        {/* security events (reset tokens, oauth, failed logins) */}
        <SecurityEventsCard ar={ar} />
      </div>
    </div>
  )
}

function SecurityEventsCard({ ar }: { ar: boolean }) {
  const { data } = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: () =>
      fetch("/api/v1/admin/security-events?limit=25", { credentials: "include" }).then((r) =>
        r.ok ? (r.json() as Promise<{ events: { id: string; action: string; actor: string; details: string | null; createdAt: string }[] }>) : { events: [] }
      ),
    refetchInterval: 60_000,
  })
  const events = data?.events ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm">{ar ? "أحداث الأمان (كلمات المرور والدخول)" : "Security events (passwords & sign-in)"}</CardTitle>
        <ShieldCheck className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-xs text-muted-foreground">{ar ? "لا أحداث بعد." : "No events yet."}</p>
        ) : (
          <ul className="space-y-2">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-2 text-xs">
                <Badge
                  variant="outline"
                  className={`shrink-0 font-mono text-[9px] ${e.action === "PASSWORD_RESET_FAILED" ? "border-red-500/40 text-red-600" : ""}`}
                >
                  {e.action}
                </Badge>
                <div className="min-w-0">
                  <p className="break-all text-muted-foreground" title={e.details ?? undefined}>
                    {e.details ?? e.actor}
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">
                    {e.actor} · {fmtWhen(e.createdAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground/70">
          {ar
            ? "رمز استعادة كلمة المرور يظهر هنا مرة واحدة — سلّمه للمستخدم عبر قناة موثوقة (صالح 30 دقيقة، يُستخدم مرة واحدة)."
            : "Password reset tokens appear here once — hand them to the user over a trusted channel (valid 30 min, single use)."}
        </p>
      </CardContent>
    </Card>
  )
}
