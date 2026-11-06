"use client"

// Fiscal-year pin selector for the sector detail page. Changing the value
// navigates to /sectors/<sector>?year=YYYY (or back to the clean URL for
// auto), which re-renders the server page on that year — the pinned view is
// then shareable/bookmarkable like /compare and /rankings pins.

import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useI18n } from "@/lib/i18n"

export function SectorPeriodSelect({ sector, year, years }: { sector: string; year: string; years: number[] }) {
  const router = useRouter()
  const { lang } = useI18n()
  const ar = lang === "ar"

  function pick(v: string) {
    const base = `/sectors/${encodeURIComponent(sector)}`
    router.replace(v === "all" ? base : `${base}?year=${v}`, { scroll: false })
  }

  return (
    <Select value={year} onValueChange={pick}>
      <SelectTrigger className="h-8 w-56 text-xs" aria-label={ar ? "الفترة" : "Period"}>
        <SelectValue placeholder={ar ? "الفترة" : "Period"} />
      </SelectTrigger>
      <SelectContent className="max-h-72">
        <SelectItem value="all" className="text-xs">
          {ar ? "تلقائي — أحدث سنة لكل شركة" : "Auto — each company's latest year"}
        </SelectItem>
        {years.map((y) => (
          <SelectItem key={y} value={String(y)} className="text-xs">
            {ar ? `سنة مالية ${y}` : `Fiscal year ${y}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
