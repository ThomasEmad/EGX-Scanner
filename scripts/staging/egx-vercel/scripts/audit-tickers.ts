import { runFullAudit } from "../src/lib/audit/audit-runner"

const tickers = (process.argv[2] || "FWRY,IRON,MHOT,AMOC,SPHT").split(",")

async function main() {
  const r = await runFullAudit({ type: "manual", persist: false })
  for (const o of r.outcomes) {
    if (!tickers.includes(o.ticker)) continue
    console.log(`\n===== ${o.ticker} acc=${o.accuracy} comp=${o.completeness} conf=${o.confidence} ${o.certification} =====`)
    for (const i of o.issues.sort((a, b) => (a.issueClass === "blocker" ? -1 : 1) - (b.issueClass === "blocker" ? -1 : 1))) {
      if (i.issueClass !== "blocker") continue
      console.log(`[${i.checkName}] ${i.period ?? ""} ${i.severity} :: ${i.details}`)
    }
  }
  process.exit(0)
}
main().catch(e => { console.error(e); process.exit(1) })
