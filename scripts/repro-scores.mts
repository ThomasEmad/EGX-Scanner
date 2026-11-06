// Time each query inside computeCompanyScores for one company.
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

async function step(label: string, p: () => Promise<unknown>, timeoutMs = 30000) {
  const t0 = Date.now()
  const res = await Promise.race([
    p().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e })),
    new Promise<{ ok: false; e: Error }>((r) => setTimeout(() => r({ ok: false, e: new Error(`TIMEOUT ${timeoutMs}ms`) }), timeoutMs)),
  ])
  if (res.ok) {
    const size = Array.isArray(res.v) ? `rows=${res.v.length}` : res.v instanceof Map ? `map=${res.v.size}` : String(res.v).slice(0, 60)
    console.log(`OK    ${label} — ${Date.now() - t0}ms — ${size}`)
    return res.v
  }
  console.log(`FAIL  ${label} — ${Date.now() - t0}ms — ${res.e instanceof Error ? res.e.message.slice(0, 140) : String(res.e)}`)
  return null
}

async function main() {
  const { db } = await import("/tmp/my-project/src/lib/db")
  const company = await db.company.findUnique({ where: { id: CID }, select: { id: true, sector: true } })
  console.log("sector:", company?.sector)

  // latestMetrics — paged
  await step("latestMetrics(paged)", async () => {
    const PAGE = 1200
    const rows: { code: string; value: number | null; valueStatus: string; statementType: string }[] = []
    let cursor: string | undefined
    for (;;) {
      const page = await db.calculatedMetric.findMany({
        where: { companyId: CID },
        orderBy: [{ id: "asc" }],
        select: { code: true, value: true, valueStatus: true, statementType: true },
        take: PAGE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      })
      rows.push(...page)
      if (page.length < PAGE) break
      cursor = page[page.length - 1].id
    }
    return rows
  })

  await step("marketPrice.findFirst", () =>
    db.marketPrice.findFirst({ where: { companyId: CID, asOf: { gte: new Date(Date.now() - 180 * 86400000) } }, orderBy: { asOf: "desc" }, select: { price: true } })
  )

  const peers = (await db.company.findMany({ where: { sector: company?.sector, isActive: true }, select: { id: true } })) as { id: string }[]
  console.log("peers:", peers.length)
  await step("peerMetrics query", () =>
    db.calculatedMetric.findMany({
      where: { companyId: { in: peers.map((p) => p.id) }, code: { in: ["p_e", "p_b"] }, valueStatus: "OK", statementType: "CONSOLIDATED" },
      select: { companyId: true, code: true, value: true, fiscalYear: true, calculatedAt: true },
      orderBy: [{ fiscalYear: "desc" }],
    })
  )
  process.exit(0)
}

main()
