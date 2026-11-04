// Deep audit execution harness — runs the full 8-category audit against the
// real database and prints a bilingual findings report.
import { runFullAudit } from "../src/lib/audit/audit-runner"

async function main() {
  const t0 = Date.now()
  const result = await runFullAudit({ type: "manual", persist: true })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  // ---- aggregate view ----
  const byCat: Record<string, number> = {}
  for (const o of result.outcomes) for (const i of o.issues) byCat[i.category] = (byCat[i.category] ?? 0) + 1

  console.log("\n================ FULL DATA AUDIT ================")
  console.log(`Run ID: ${result.runId} | type=${result.type}`)
  console.log(`Companies checked: ${result.companiesChecked} in ${elapsed}s`)
  console.log(`Issues — CRITICAL: ${result.issuesFound.critical} | HIGH: ${result.issuesFound.high} | MEDIUM: ${result.issuesFound.medium} | LOW: ${result.issuesFound.low} | TOTAL: ${result.issuesFound.total}`)
  console.log(`By category: ${JSON.stringify(byCat)}`)
  console.log(`By class: ${JSON.stringify(result.byClass)}`)

  // ---- blocker count (the launch gate) ----
  let blockerCritical = 0
  let blockerHigh = 0
  for (const o of result.outcomes) {
    for (const i of o.issues) {
      if (i.issueClass !== "blocker") continue
      if (i.severity === "critical") blockerCritical++
      if (i.severity === "high") blockerHigh++
    }
  }
  console.log(`Blocker-class issues: CRITICAL ${blockerCritical} | HIGH ${blockerHigh}`)

  if (blockerCritical > 0) {
    console.log("\n---------- BLOCKER-CLASS CRITICALS ----------")
    for (const o of result.outcomes) {
      for (const i of o.issues) {
        if (i.issueClass === "blocker" && i.severity === "critical") {
          console.log(`${o.ticker} ${i.checkName}${i.period ? ` @${i.period}` : ""}: ${i.details.slice(0, 260)}`)
        }
      }
    }
  }

  if (blockerHigh > 0) {
    console.log("\n---------- BLOCKER-CLASS HIGH ----------")
    for (const o of result.outcomes) {
      for (const i of o.issues) {
        if (i.issueClass === "blocker" && i.severity === "high") {
          console.log(`${o.ticker} ${i.checkName}${i.period ? ` @${i.period}` : ""}: ${i.details.slice(0, 260)}`)
        }
      }
    }
  }

  // ---- critical issue headlines ----
  console.log("\n---------- TOP CRITICAL / HIGH ISSUES ----------")
  const headline: Array<{ ticker: string; sev: string; check: string; details: string }> = []
  for (const o of result.outcomes) {
    for (const i of o.issues) {
      if (i.severity === "critical" || i.severity === "high") {
        headline.push({ ticker: o.ticker, sev: i.severity, check: i.checkName, details: i.details })
      }
    }
  }
  headline.slice(0, 60).forEach((h, idx) => console.log(`${idx + 1}. [${h.sev.toUpperCase()}] ${h.ticker} — ${h.check}: ${h.details.slice(0, 180)}`))

  // ---- stale companies ranking (deep refresh targets) ----
  console.log("\n---------- STALE / REFRESH TARGETS (age months desc) ----------")
  const stale = result.outcomes.filter(o => o.latestDataAgeMonths > 12).sort((a, b) => b.latestDataAgeMonths - a.latestDataAgeMonths)
  for (const s of stale.slice(0, 40)) console.log(`${s.ticker} (${s.sector}) — latest: ${s.latestDataPeriod ?? "NO DATA"}, age: ${s.latestDataAgeMonths}mo, conf: ${s.confidence}`)

  // ---- confidence score distribution ----
  const zones = { high: 0, medium: 0, low: 0, critical: 0 }
  for (const o of result.outcomes) zones[o.confidenceRating as keyof typeof zones]++
  console.log(`\nConfidence distribution: high(80+)=${zones.high} | medium(60-79)=${zones.medium} | low(30-59)=${zones.low} | critical(<30)=${zones.critical}`)

  // ---- lowest confidence companies (fix priority) ----
  console.log("\n---------- WORST CONFIDENCE (top 25) ----------")
  const worst = [...result.outcomes].sort((a, b) => a.confidence - b.confidence).slice(0, 25)
  for (const w of worst) {
    const crit = w.issues.filter(i => i.severity === "critical").length
    const high = w.issues.filter(i => i.severity === "high").length
    console.log(`${w.ticker} (${w.sector}) conf=${w.confidence} — critical:${crit} high:${high} latest:${w.latestDataPeriod ?? "none"}`)
  }

  process.exit(0)
}
main().catch(e => { console.error("AUDIT FAILED:", e); process.exit(1) })
