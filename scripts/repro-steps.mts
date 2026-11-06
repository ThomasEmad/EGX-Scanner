// Step-by-step timing of every query buildAiSnapshotBundle performs, against
// production Turso, with a hard timeout per step to identify the hanging one.
import { readFileSync } from "node:fs"
const envVar = (name: string): string => {
  const line = readFileSync("/tmp/my-project/.env", "utf8")
    .split("\n")
    .find((l) => l.startsWith(name + "="))
  return line ? line.slice(name.length + 1).trim() : ""
}
process.env.TURSO_DATABASE_URL ||= envVar("TURSO_DATABASE_URL") ||
  (readFileSync("/home/z/my-project/scripts/turso-query.sh", "utf8").match(/URL="(https:\/\/[^"]+)\/v2\/pipeline"/)?.[1] ?? "")
process.env.TURSO_AUTH_TOKEN ||= envVar("TURSO_AUTH_TOKEN") ||
  (readFileSync("/home/z/my-project/scripts/turso-query.sh", "utf8").match(/TOKEN="([^"]+)"/)?.[1] ?? "")

const CID = process.argv[2] || "cmui726f8004hbx90jyyuioyk"

async function step(label: string, p: () => Promise<unknown>, timeoutMs = 25000): Promise<void> {
  const t0 = Date.now()
  const res = await Promise.race([
    p().then(
      (v) => ({ ok: true as const, v }),
      (e) => ({ ok: false as const, e })
    ),
    new Promise<{ ok: false; e: Error }>((resolve) =>
      setTimeout(() => resolve({ ok: false, e: new Error(`TIMEOUT ${timeoutMs}ms`) }), timeoutMs)
    ),
  ])
  if (res.ok) {
    const size = Array.isArray(res.v) ? `rows=${res.v.length}` : typeof res.v === "object" && res.v ? Object.keys(res.v as object).slice(0, 6).join(",") : String(res.v).slice(0, 60)
    console.log(`OK    ${label} — ${Date.now() - t0}ms — ${size}`)
  } else {
    console.log(`FAIL  ${label} — ${Date.now() - t0}ms — ${res.e instanceof Error ? res.e.message.slice(0, 160) : String(res.e)}`)
  }
}

async function main() {
  const { db } = await import("/tmp/my-project/src/lib/db")
  const { fetchCalc } = await import("/tmp/my-project/src/lib/financial/statement-pref")
  const { computeCompanyScores } = await import("/tmp/my-project/src/lib/financial/scores")
  const { buildResearchProfile } = await import("/tmp/my-project/src/lib/financial/analysis/research-profile")
  const { buildInvestorSignals } = await import("/tmp/my-project/src/lib/financial/analysis/investor-signals")

  await step("company.findFirst", () =>
    db.company.findFirst({ where: { id: CID }, select: { id: true, ticker: true } })
  )
  await step("fetchCalc (paged)", () => fetchCalc(CID))
  const reports = await db.financialReport.findMany({
    where: { companyId: CID, processingStatus: { in: ["VALIDATED", "APPROVED", "EXTRACTED"] } },
    select: { id: true, statementType: true, periodType: true, fiscalYear: true, periodLabel: true },
    orderBy: [{ fiscalYear: "asc" }, { periodLabel: "asc" }],
  })
  console.log("OK    financialReport — rows=", reports.length)
  const consIds = reports.filter((r) => r.statementType === "CONSOLIDATED").map((r) => r.id)
  await step("financialValue (1113 expected)", () =>
    db.financialValue.findMany({
      where: { companyId: CID, reportId: { in: consIds }, validationStatus: "VALID" },
      select: { reportId: true, metricCode: true, normalizedValue: true, unit: true },
    })
  )
  await step("financialEvent", () =>
    db.financialEvent.findMany({ where: { companyId: CID }, take: 8, orderBy: [{ fiscalYear: "desc" }] })
  )
  await step("getLatestPrice", async () => {
    const { getLatestPrice } = await import("/tmp/my-project/src/lib/financial/market")
    return getLatestPrice(CID)
  })
  await step("computeCompanyScores", () => computeCompanyScores(CID))
  await step("buildResearchProfile", () => buildResearchProfile(CID as never))
  await step("buildInvestorSignals", () => buildInvestorSignals(CID as never))
  process.exit(0)
}

main()
