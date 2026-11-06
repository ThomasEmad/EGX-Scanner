// Dry-run preview of the v2 audit — no writes. Prints the precision breakdown
// and the remediation queue so the result can be validated before persisting.
import { runFullAudit } from "../src/lib/audit/audit-runner"
import { ROOT_CAUSE_LABELS, type RootCause } from "../src/lib/audit/issue-class"

async function main() {
  const t0 = Date.now()
  const r = await runFullAudit({ type: "manual", persist: false })
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)

  console.log(`\n=== AUDIT v2 DRY RUN — ${r.companiesChecked} companies in ${elapsed}s ===`)
  console.log(`total=${r.issuesFound.total} critical=${r.issuesFound.critical} high=${r.issuesFound.high} medium=${r.issuesFound.medium} low=${r.issuesFound.low}`)
  console.log("by class:", r.byClass)

  const cert = { certified: 0, provisional: 0, review_required: 0 }
  const accBands = { perfect: 0, near: 0, fair: 0, poor: 0 }
  for (const o of r.outcomes) {
    cert[o.certification as keyof typeof cert]++
    if (o.accuracy >= 100) accBands.perfect++
    else if (o.accuracy >= 95) accBands.near++
    else if (o.accuracy >= 80) accBands.fair++
    else accBands.poor++
  }
  console.log("certification:", cert)
  console.log("accuracy bands (100 / 95-99 / 80-94 / <80):", accBands)

  console.log("\n--- root causes (all findings) ---")
  for (const [k, v] of Object.entries(r.byRootCause).sort((a, b) => b[1] - a[1])) {
    const label = ROOT_CAUSE_LABELS[k as RootCause]
    console.log(String(v).padStart(5), k.padEnd(18), label ? label.en : "")
  }

  console.log("\n--- blocker findings by root cause ---")
  const blockerRoots = new Map<string, number>()
  for (const o of r.outcomes) for (const i of o.issues) if (i.issueClass === "blocker") blockerRoots.set(i.rootCause ?? "OTHER", (blockerRoots.get(i.rootCause ?? "OTHER") ?? 0) + 1)
  for (const [k, v] of [...blockerRoots.entries()].sort((a, b) => b[1] - a[1])) console.log(String(v).padStart(5), k)

  console.log("\n--- companies with blockers (top 25 by blocker count) ---")
  const withBlockers = r.outcomes
    .map(o => ({ o, n: o.issues.filter(i => i.issueClass === "blocker").length }))
    .filter(x => x.n > 0)
    .sort((a, b) => b.n - a.n)
  console.log("companies with ≥1 blocker:", withBlockers.length, "of", r.outcomes.length)
  for (const { o, n } of withBlockers.slice(0, 25)) {
    const roots = [...new Set(o.issues.filter(i => i.issueClass === "blocker").map(i => i.rootCause))].join(",")
    console.log(`${o.ticker.padEnd(6)} blockers=${String(n).padStart(3)} accuracy=${o.accuracy} completeness=${o.completeness} conf=${o.confidence} [${roots}]`)
  }

  console.log("\n--- blocker samples (first 40) ---")
  let shown = 0
  for (const o of r.outcomes) {
    for (const i of o.issues) {
      if (i.issueClass !== "blocker" || shown >= 40) continue
      console.log(`[${o.ticker}] ${i.checkName} ${i.period ?? ""} :: ${i.details.slice(0, 190)}`)
      shown++
    }
    if (shown >= 40) break
  }

  console.log("\n--- lowest overall quality (top 20) ---")
  for (const o of [...r.outcomes].sort((a, b) => a.confidence - b.confidence).slice(0, 20)) {
    console.log(`${o.ticker.padEnd(6)} score=${String(o.confidence).padStart(3)} acc=${String(o.accuracy).padStart(3)} comp=${String(o.completeness).padStart(3)} fresh=${String(o.freshness).padStart(3)} prov=${String(o.provenance).padStart(3)} ${o.certification}`)
  }

  console.log("\n--- quarantine load (top 20) ---")
  for (const o of [...r.outcomes].sort((a, b) => b.quarantinedValues - a.quarantinedValues).slice(0, 20)) {
    console.log(`${o.ticker.padEnd(6)} usable=${String(o.usableValues).padStart(4)} quarantined=${String(o.quarantinedValues).padStart(4)}`)
  }
  process.exit(0)
}
main().catch(e => { console.error("PREVIEW FAILED:", e); process.exit(1) })
