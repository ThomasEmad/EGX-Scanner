// Resolve companies that have no trusted financial data.
//
// Evidence gathered 2026-11-03:
//   * ECCW, EFOOD, MESF, PSFL, RPCO, VODE are absent from the current EGX
//     market directory, the TradingView EGX scanner and Mubasher company pages.
//     Their only stored values are untrusted Yahoo Finance market data.
//   * KORA is live on the TradingView EGX scanner (EGX:KORA, 1.75 EGP) but has
//     not published financial statements yet. It stays active with a public
//     "statements not yet available" note instead of being hidden.
//
// The change is reversible: isActive and the old description are recorded in
// reports/nodata-deactivation-rollback.json.
//
// Usage:
//   node scripts/deactivate-nodata-companies.mjs            # dry run
//   node scripts/deactivate-nodata-companies.mjs --apply    # write

import fs from "node:fs"
import path from "node:path"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const OUT = path.join(process.cwd(), "reports")

const DEACTIVATE = ["ECCW", "EFOOD", "MESF", "PSFL", "RPCO", "VODE"]
const KEEP_ACTIVE = ["KORA"]

const NOTE_EN =
  "Coverage suspended: no current EGX listing or authoritative financial statements were found as of 3 November 2026. The page is excluded from rankings and the sitemap until verified data is available."
const NOTE_AR =
  "تغطية معلّقة: لم يتم العثور على إدراج حالي في البورصة المصرية أو قوائم مالية موثوقة حتى ٣ نوفمبر ٢٠٢٦. تُستبعد الصفحة من التصنيفات وخريطة الموقع حتى توفر بيانات موثقة."
const KORA_NOTE_EN =
  "KORRA is a recent EGX listing. Its shares trade on the exchange, but no annual or interim financial statements have been published through an authoritative source yet. Financial metrics will appear once statements are available."
const KORA_NOTE_AR =
  "قرة لمشروعات الطاقة والاستثمار إدراج حديث في البورصة المصرية. يتم تداول أسهمها، لكن لم تُنشر قوائم مالية سنوية أو دورية عبر مصدر موثوق بعد. ستظهر المؤشرات المالية بمجرد توفر القوائم."

const rows = []
const rollback = { generatedAt: new Date().toISOString(), changes: [] }

for (const ticker of [...DEACTIVATE, ...KEEP_ACTIVE]) {
  const company = await db.company.findUnique({
    where: { ticker },
    select: {
      id: true,
      ticker: true,
      isActive: true,
      nameEn: true,
      descriptionEn: true,
      descriptionAr: true,
      listingStatus: true,
      _count: { select: { reports: true, marketPrices: true } },
    },
  })
  if (!company) {
    rows.push({ ticker, status: "not_found" })
    continue
  }
  const validValues = await db.financialValue.count({
    where: { companyId: company.id, validationStatus: "VALID" },
  })
  const deactivate = DEACTIVATE.includes(ticker)
  if (deactivate && validValues > 0) {
    rows.push({ ticker, status: "skipped_has_valid_values", validValues })
    continue
  }

  const noteEn = deactivate ? NOTE_EN : KORA_NOTE_EN
  const noteAr = deactivate ? NOTE_AR : KORA_NOTE_AR
  const data = {
    isActive: deactivate ? false : true,
    lastVerifiedAt: new Date(),
    ...(company.descriptionEn ? {} : { descriptionEn: noteEn }),
    ...(company.descriptionAr ? {} : { descriptionAr: noteAr }),
  }

  rows.push({
    ticker,
    status: deactivate ? "deactivate" : "keep_active_with_note",
    validValues,
    reports: company._count.reports,
    prices: company._count.marketPrices,
    oldIsActive: company.isActive,
    newIsActive: data.isActive,
  })
  rollback.changes.push({
    companyId: company.id,
    ticker,
    oldIsActive: company.isActive,
    newIsActive: data.isActive,
    oldDescriptionEn: company.descriptionEn,
    newDescriptionEn: data.descriptionEn ?? company.descriptionEn,
    oldDescriptionAr: company.descriptionAr,
    newDescriptionAr: data.descriptionAr ?? company.descriptionAr,
  })

  if (APPLY) {
    await db.company.update({ where: { id: company.id }, data })
  }
}

const summary = {
  applied: APPLY,
  deactivated: rows.filter((r) => r.status === "deactivate").map((r) => r.ticker),
  keptActive: rows.filter((r) => r.status === "keep_active_with_note").map((r) => r.ticker),
  skipped: rows.filter((r) => r.status.startsWith("skipped")),
  rows,
}

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, "nodata-deactivation.json"), JSON.stringify(summary, null, 2))
if (APPLY) {
  fs.writeFileSync(path.join(OUT, "nodata-deactivation-rollback.json"), JSON.stringify(rollback, null, 2))
}
console.log(JSON.stringify(summary, null, 1))
if (!APPLY) console.log("Dry run only. Re-run with --apply to write.")
await db.$disconnect()
