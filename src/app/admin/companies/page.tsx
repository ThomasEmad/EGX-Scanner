"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Trash2, Pencil, Database, Search, Check, X } from "lucide-react"

interface Co {
  id: string; ticker: string; nameEn: string; nameAr: string | null; sector: string
  _count: { reports: number; values: number; marketPrices: number }
}

const FIELDS = [
  { code: "REVENUE", ar: "الإيرادات" }, { code: "COGS", ar: "تكلفة المبيعات" },
  { code: "GROSS_PROFIT", ar: "إجمالي الربح" }, { code: "OPERATING_INCOME", ar: "الربح التشغيلي" },
  { code: "PROFIT_BEFORE_TAX", ar: "الربح قبل الضريبة" }, { code: "INCOME_TAX", ar: "الضريبة" },
  { code: "NET_PROFIT", ar: "صافي الربح" }, { code: "TOTAL_ASSETS", ar: "إجمالي الأصول" },
  { code: "CURRENT_ASSETS", ar: "الأصول المتداولة" }, { code: "NON_CURRENT_ASSETS", ar: "الأصول غير المتداولة" },
  { code: "TOTAL_LIABILITIES", ar: "إجمالي الالتزامات" }, { code: "TOTAL_EQUITY", ar: "حقوق المساهمين" },
  { code: "CASH_AND_EQUIVALENTS", ar: "النقد" }, { code: "TOTAL_DEBT", ar: "إجمالي الدين" },
  { code: "OPERATING_CASH_FLOW", ar: "التدفق التشغيلي" }, { code: "EPS", ar: "ربحية السهم" },
  { code: "SHARES_OUTSTANDING", ar: "عدد الأسهم" },
]

const SECTORS = ["Banks","Real Estate","Industrial","Telecom","Healthcare","Food","Investment","Financial Services","Consumer","Energy","Other"]

export default function CompanyManagePage() {
  const router = useRouter()
  const [companies, setCompanies] = useState<Co[]>([])
  const [search, setSearch] = useState("")
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState({ ticker: "", nameEn: "", nameAr: "", sector: "" })
  const [selected, setSelected] = useState<Co | null>(null)
  const [entryPeriod, setEntryPeriod] = useState({ type: "ANNUAL", year: "2025", label: "FY 2025", end: "2025-12-31" })
  const [entryVals, setEntryVals] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState("")
  const [loading, setLoading] = useState(true)
  const [adminOk, setAdminOk] = useState<boolean | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    let cancelled = false
    fetch("/api/v1/admin/me", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setAdminOk(!!data.isAdmin)
      })
      .catch(() => {
        if (!cancelled) { setAdminOk(false); router.replace("/admin/login") }
      })
    return () => { cancelled = true }
  }, [router])

  const load = useCallback(async () => {
    if (adminOk !== true) return
    try {
      const r = await fetch("/api/v1/admin/company-ops")
      if (r.ok) { const j = await r.json(); setCompanies(j.companies) }
    } catch {}
    setLoading(false)
  }, [adminOk])

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true
    load()
  }, [load])

  const saveEdit = async () => {
    if (!editing) return
    const r = await fetch("/api/v1/admin/company-ops", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: editing, ...editForm }),
    })
    if (r.ok) { setEditing(null); load() } else { const j = await r.json(); alert(j.error || "error") }
  }

  const deleteCompany = async (ticker: string) => {
    if (!confirm(`حذف ${ticker} نهائيًا مع كل بياناته؟`)) return
    const r = await fetch(`/api/v1/admin/company-ops?ticker=${ticker}`, {
      method: "DELETE",
    })
    if (r.ok) { setMsg(`تم حذف ${ticker}`); load() } else { const j = await r.json(); alert(j.error) }
  }

  const submitData = async () => {
    if (!selected) return
    const vals: Record<string, number> = {}
    for (const [code, v] of Object.entries(entryVals)) {
      const n = parseFloat(v)
      if (isFinite(n) && v.trim() !== "") vals[code] = n
    }
    if (!Object.keys(vals).length) { alert("أدخل قيمة واحدة على الأقل"); return }
    const r = await fetch("/api/v1/admin/company-ops", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ticker: selected.ticker, periodType: entryPeriod.type, fiscalYear: parseInt(entryPeriod.year),
        periodLabel: entryPeriod.label, periodEnd: entryPeriod.end, values: vals,
      }),
    })
    const j = await r.json()
    if (r.ok) { setMsg(`✅ ${selected.ticker} ${entryPeriod.label}: ${j.valuesEntered} قيمة + إعادة حساب`); setEntryVals({}); setSelected(null) }
    else setMsg(`❌ ${j.error || "error"}`)
  }

  const filtered = companies.filter(c =>
    !search || c.ticker.toLowerCase().includes(search.toLowerCase()) || (c.nameAr || "").includes(search) || (c.nameEn || "").toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4" dir="rtl">
      <h1 className="text-xl font-bold">إدارة الشركات — حذف وتعديل وإدخال بيانات</h1>
      {msg && <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">{msg}</div>}

      {selected ? (
        <Card className="border-primary/40">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="h-4 w-4" /> إدخال بيانات يدوي — {selected.ticker}
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><X className="h-3 w-3" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-[10px]">نوع الفترة</Label>
                <select value={entryPeriod.type} onChange={e => {
                  const t = e.target.value
                  const endMd: Record<string,string> = { ANNUAL: "-12-31", SEMIANNUAL: "-06-30", QUARTERLY: "-03-31", NINE_MONTH: "-09-30" }
                  const prefix = t === "ANNUAL" ? "FY " : t === "SEMIANNUAL" ? "H1 " : t === "QUARTERLY" ? "Q1 " : "9M "
                  setEntryPeriod(p => ({ ...p, type: t, label: prefix + p.year, end: p.year + (endMd[t] || "-12-31") }))
                }} className="w-full rounded border p-1.5 text-xs">
                  <option value="ANNUAL">سنوي</option><option value="SEMIANNUAL">نصف سنوي</option><option value="QUARTERLY">ربع سنوي</option><option value="NINE_MONTH">9 شهور</option>
                </select>
              </div>
              <div><Label className="text-[10px]">السنة</Label>
                <Input value={entryPeriod.year} onChange={e => {
                  const y = e.target.value
                  const endMd: Record<string,string> = { ANNUAL: "-12-31", SEMIANNUAL: "-06-30", QUARTERLY: "-03-31", NINE_MONTH: "-09-30" }
                  const prefix = entryPeriod.type === "ANNUAL" ? "FY " : entryPeriod.type === "SEMIANNUAL" ? "H1 " : entryPeriod.type === "QUARTERLY" ? "Q1 " : "9M "
                  setEntryPeriod(p => ({ ...p, year: y, label: prefix + y, end: y + (endMd[p.type] || "-12-31") }))
                }} className="h-7 text-xs" />
              </div>
              <div><Label className="text-[10px]">تسمية الفترة</Label><Input value={entryPeriod.label} onChange={e => setEntryPeriod(p => ({ ...p, label: e.target.value }))} className="h-7 text-xs" /></div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {FIELDS.map(f => (
                <div key={f.code}>
                  <Label className="text-[10px] text-muted-foreground">{f.ar}</Label>
                  <Input type="number" placeholder="—" value={entryVals[f.code] || ""} onChange={e => setEntryVals(v => ({ ...v, [f.code]: e.target.value }))} className="h-7 text-xs tabular-nums" />
                </div>
              ))}
            </div>
            <Button size="sm" onClick={submitData} className="w-full">حفظ + إعادة حساب المقاييس</Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm">الشركات ({filtered.length})</CardTitle>
          <div className="relative w-48"><Search className="absolute start-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="بحث…" value={search} onChange={e => setSearch(e.target.value)} className="h-7 ps-7 text-xs" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10"><tr className="border-b">
                <th className="p-2 text-start">الكود</th><th className="p-2 text-start">الاسم EN</th>
                <th className="p-2 text-start">الاسم AR</th><th className="p-2 text-start">القطاع</th>
                <th className="p-2 text-center">تقارير</th>
                <th className="p-2 text-center">قيم</th><th className="p-2 text-center">أسعار</th>
                <th className="p-2 text-center">إجراءات</th>
              </tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-b hover:bg-muted/40">
                    {editing === c.id ? (
                      <>
                        <td className="p-1.5"><Input value={editForm.ticker} onChange={e => setEditForm(f => ({ ...f, ticker: e.target.value }))} className="h-6 w-20 text-xs" /></td>
                        <td className="p-1.5"><Input value={editForm.nameEn} onChange={e => setEditForm(f => ({ ...f, nameEn: e.target.value }))} className="h-6 w-32 text-xs" dir="ltr" /></td>
                        <td className="p-1.5"><Input value={editForm.nameAr} onChange={e => setEditForm(f => ({ ...f, nameAr: e.target.value }))} className="h-6 w-32 text-xs" dir="rtl" placeholder="الاسم بالعربي" /></td>
                        <td className="p-1.5"><select value={editForm.sector} onChange={e => setEditForm(f => ({ ...f, sector: e.target.value }))} className="h-6 w-24 rounded border text-xs">{SECTORS.map(s => <option key={s}>{s}</option>)}</select></td>
                        <td colSpan={2} />
                        <td className="p-1.5 flex gap-1">
                          <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-3 w-3" /></Button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="p-2 font-mono font-semibold">{c.ticker}</td>
                        <td className="p-2" dir="ltr">{c.nameEn}</td>
                        <td className="p-2" dir="rtl">{c.nameAr || "—"}</td>
                        <td className="p-2"><Badge variant="secondary" className="text-[9px]">{c.sector}</Badge></td>
                        <td className="p-2 text-center tabular-nums">{c._count.reports}</td>
                        <td className="p-2 text-center tabular-nums">{c._count.values}</td>
                        <td className="p-2 text-center tabular-nums">{c._count.marketPrices}</td>
                        <td className="p-2 flex gap-1">
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="إضافة بيانات" onClick={() => { setSelected(c); setEntryVals({}); setEntryPeriod({ type: "ANNUAL", year: "2025", label: "FY 2025", end: "2025-12-31" }) }}>
                            <Database className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" title="تعديل" onClick={() => { setEditing(c.id); setEditForm({ ticker: c.ticker, nameEn: c.nameEn, nameAr: c.nameAr || "", sector: c.sector }) }}>
                            <Pencil className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500" title="حذف نهائي" onClick={() => deleteCompany(c.ticker)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
