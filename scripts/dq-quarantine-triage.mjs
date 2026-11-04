// Export a triage view of every quarantined FinancialValue.
//
//   node scripts/dq-quarantine-triage.mjs
//
// Quarantine is reversible: values are marked NEEDS_REVIEW with an
// `AUDIT_QUARANTINE:` note and kept on disk. This report groups them by
// reason / company / metric so a human can decide restore vs re-extract.
//
// Produces:
//   reports/quarantine-triage.csv   — one row per quarantined value
//   reports/quarantine-summary.md   — counts by reason, company and metric
import { mkdirSync, writeFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

function esc(v) {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function reasonOf(note) {
  const n = note ?? ""
  if (/cross-quarter duplicate/i.test(n)) return "cross_quarter_duplicate"
  if (/carried-forward|COPIED from/i.test(n)) return "carried_forward"
  if (/zero placeholder|zero value/i.test(n)) return "zero_placeholder"
  if (/annual-copy|annual copy|contamination|no genuine quarterly/i.test(n)) return "annual_copy"
  if (/broken-source|broken source/i.test(n)) return "broken_source"
  if (/fabricated template|template value/i.test(n)) return "fabricated_template"
  if (/column-copy|column copy/i.test(n)) return "column_copy"
  if (/copy family|same value repeated/i.test(n)) return "duplicate_copy"
  if (/TEAL/i.test(n)) return "teal_mismatch"
  if (/sign/i.test(n)) return "sign_inversion"
  if (/mixed-scale|scale family|×1000|x1000|\/100|\/10\b/i.test(n)) return "unit_scale"
  if (/mapping|mis-map/i.test(n)) return "mapping"
  if (/duplicate/i.test(n)) return "duplicate"
  if (/garbage|implausible|inconsistent/i.test(n)) return "implausible"
  return "other_review"
}

async function main() {
  const rows = await db.financialValue.findMany({
    where: { validationStatus: "NEEDS_REVIEW" },
    orderBy: [{ metricCode: "asc" }, { createdAt: "asc" }],
    select: {
      id: true, metricCode: true, value: true, normalizedValue: true, unit: true,
      subPeriod: true, validationNotes: true, correctedBy: true, correctionReason: true,
      createdAt: true, reportId: true,
      report: { select: { periodLabel: true, periodType: true, company: { select: { ticker: true } } } },
    },
  })

  const enriched = rows.map((r) => ({
    ...r,
    ticker: r.report.company.ticker,
    period: r.report.periodLabel,
    periodType: r.report.periodType,
    reason: r.validationNotes?.includes("AUDIT_QUARANTINE:") ? reasonOf(r.validationNotes) : "legacy_review",
  }))

  mkdirSync("reports", { recursive: true })
  const header = ["ticker", "period", "periodType", "metric", "subPeriod", "value", "unit", "reason", "note", "correctedBy", "reportId", "createdAt"]
  const csv = [header.join(",")]
  for (const r of enriched) {
    csv.push([
      r.ticker, r.period, r.periodType, r.metricCode, r.subPeriod, r.normalizedValue, r.unit,
      r.reason, r.validationNotes, r.correctedBy, r.reportId, r.createdAt.toISOString(),
    ].map(esc).join(","))
  }
  writeFileSync("reports/quarantine-triage.csv", "\uFEFF" + csv.join("\r\n"), "utf8")

  const byReason = new Map()
  const byTicker = new Map()
  const byMetric = new Map()
  for (const r of enriched) {
    byReason.set(r.reason, (byReason.get(r.reason) ?? 0) + 1)
    byTicker.set(r.ticker, (byTicker.get(r.ticker) ?? 0) + 1)
    byMetric.set(r.metricCode, (byMetric.get(r.metricCode) ?? 0) + 1)
  }

  const md = []
  md.push(`# Quarantine triage`)
  md.push(``)
  md.push(`Total NEEDS_REVIEW values: **${enriched.length}** (reversible — nothing was deleted).`)
  md.push(``)
  md.push(`| Reason | Values |`)
  md.push(`|---|---:|`)
  for (const [k, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) md.push(`| ${k} | ${n} |`)
  md.push(``)
  md.push(`## Top companies`)
  md.push(``)
  md.push(`| Ticker | Values |`)
  md.push(`|---|---:|`)
  for (const [k, n] of [...byTicker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) md.push(`| ${k} | ${n} |`)
  md.push(``)
  md.push(`## Top metrics`)
  md.push(``)
  md.push(`| Metric | Values |`)
  md.push(`|---|---:|`)
  for (const [k, n] of [...byMetric.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) md.push(`| ${k} | ${n} |`)
  md.push(``)
  md.push(`Full row-level export: \`reports/quarantine-triage.csv\`.`)
  writeFileSync("reports/quarantine-summary.md", md.join("\n"), "utf8")

  console.log(`NEEDS_REVIEW values: ${enriched.length}`)
  for (const [k, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k.padEnd(24)} ${n}`)
  console.log("wrote reports/quarantine-triage.csv and reports/quarantine-summary.md")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
