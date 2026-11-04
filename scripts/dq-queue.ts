// Export the open data-quality remediation queue from the latest audit run.
//
//   npx tsx scripts/dq-queue.ts
//
// Produces:
//   reports/data-quality-blockers.csv  — one row per blocker (accuracy work)
//   reports/data-quality-blockers.md   — grouped by root cause with actions
//   reports/data-quality-coverage.csv  — coverage gaps (completeness work)
//
// The queue is deterministic: it classifies stored issue descriptions with the
// same classifier the audit runner uses, so it cannot drift from the dashboard.
import { mkdirSync, writeFileSync } from "node:fs"
import { PrismaClient } from "@prisma/client"
import { classifyStoredIssue, ROOT_CAUSE_LABELS, type RootCause } from "../src/lib/audit/issue-class"

const db = new PrismaClient()

function esc(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

async function main() {
  const run = await db.auditRun.findFirst({
    where: { status: "completed" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true, companiesChecked: true, issuesFound: true },
  })
  if (!run) throw new Error("No completed audit run")

  const rows = await db.auditIssue.findMany({
    where: { auditRunId: run.id, status: "open" },
    orderBy: [{ ticker: "asc" }, { period: "asc" }, { severity: "asc" }],
    select: {
      ticker: true, period: true, metricCode: true, category: true, severity: true,
      description: true, descriptionAr: true, currentValue: true, expectedValue: true, source: true,
    },
  })

  const classified = rows.map((r) => {
    const c = classifyStoredIssue(r)
    const label = ROOT_CAUSE_LABELS[c.rootCause as RootCause]
    return { ...r, issueClass: c.issueClass, rootCause: c.rootCause, actionEn: label?.action.en ?? "", actionAr: label?.action.ar ?? "", labelEn: label?.en ?? c.rootCause, labelAr: label?.ar ?? c.rootCause }
  })

  const blockers = classified.filter((r) => r.issueClass === "blocker")
  const coverage = classified.filter((r) => r.issueClass === "coverage")

  mkdirSync("reports", { recursive: true })

  const header = ["ticker", "period", "metric", "rootCause", "severity", "description", "recommendedAction"]
  const csv = [header.join(",")]
  for (const r of blockers) csv.push([r.ticker, r.period, r.metricCode, r.rootCause, r.severity, r.description, r.actionEn].map(esc).join(","))
  writeFileSync("reports/data-quality-blockers.csv", "\uFEFF" + csv.join("\r\n"), "utf8")

  const covHeader = ["ticker", "period", "metric", "rootCause", "severity", "description", "recommendedAction"]
  const covCsv = [covHeader.join(",")]
  for (const r of coverage) covCsv.push([r.ticker, r.period, r.metricCode, r.rootCause, r.severity, r.description, r.actionEn].map(esc).join(","))
  writeFileSync("reports/data-quality-coverage.csv", "\uFEFF" + covCsv.join("\r\n"), "utf8")

  const byRoot = new Map<string, typeof blockers>()
  for (const r of blockers) {
    if (!byRoot.has(r.rootCause)) byRoot.set(r.rootCause, [])
    byRoot.get(r.rootCause)!.push(r)
  }
  const byTicker = new Map<string, number>()
  for (const r of blockers) byTicker.set(r.ticker, (byTicker.get(r.ticker) ?? 0) + 1)

  const md: string[] = []
  md.push(`# Data-quality remediation queue`)
  md.push(``)
  md.push(`Audit run: \`${run.id}\` — ${run.startedAt.toISOString()} — ${run.companiesChecked} companies, ${run.issuesFound} findings.`)
  md.push(``)
  md.push(`- **Blockers (accuracy work): ${blockers.length}** across ${byTicker.size} companies`)
  md.push(`- Coverage gaps (completeness work): ${coverage.length}`)
  md.push(`- Full CSV: \`reports/data-quality-blockers.csv\` and \`reports/data-quality-coverage.csv\``)
  md.push(``)
  md.push(`## Blockers by root cause`)
  md.push(``)
  md.push(`| Root cause | Count | Recommended action |`)
  md.push(`|---|---:|---|`)
  for (const [root, items] of [...byRoot.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md.push(`| ${root} — ${items[0].labelEn} | ${items.length} | ${items[0].actionEn} |`)
  }
  md.push(``)
  for (const [root, items] of [...byRoot.entries()].sort((a, b) => b[1].length - a[1].length)) {
    md.push(`### ${root} — ${items[0].labelEn} (${items.length})`)
    md.push(``)
    md.push(`_${items[0].actionEn}_`)
    md.push(``)
    for (const r of items) {
      md.push(`- **${r.ticker}** ${r.period ?? ""}${r.metricCode ? ` · \`${r.metricCode}\`` : ""} — ${r.description}`)
    }
    md.push(``)
  }
  writeFileSync("reports/data-quality-blockers.md", md.join("\n"), "utf8")

  console.log(`run ${run.id}: blockers=${blockers.length} companies=${byTicker.size} coverage=${coverage.length}`)
  for (const [root, items] of [...byRoot.entries()].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${root.padEnd(18)} ${String(items.length).padStart(3)}`)
  }
  console.log("wrote reports/data-quality-blockers.{csv,md} and reports/data-quality-coverage.csv")
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
