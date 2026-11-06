// Isolate which query shape hangs: take sizes, orderBy variants, cursor pages.
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

const CID = "cmui726f8004hbx90jyyuioyk"
const SEL = { code: true, value: true, valueStatus: true, statementType: true }

async function step(label: string, p: () => Promise<unknown>, timeoutMs = 20000) {
  const t0 = Date.now()
  const res = await Promise.race([
    p().then((v) => ({ ok: true as const, v }), (e) => ({ ok: false as const, e })),
    new Promise<{ ok: false; e: Error }>((r) => setTimeout(() => r({ ok: false, e: new Error("TIMEOUT") }), timeoutMs)),
  ])
  console.log(res.ok ? `OK    ${label} — ${Date.now() - t0}ms — rows=${(res.v as unknown[]).length}` : `FAIL  ${label} — ${Date.now() - t0}ms — ${res.e instanceof Error ? res.e.message.slice(0, 120) : "?"}`)
}

async function main() {
  const { db } = await import("/tmp/my-project/src/lib/db")

  await step("A: orderBy id, take 300", () =>
    db.calculatedMetric.findMany({ where: { companyId: CID }, orderBy: [{ id: "asc" }], select: SEL, take: 300 })
  )
  await step("B: orderBy id, take 1200", () =>
    db.calculatedMetric.findMany({ where: { companyId: CID }, orderBy: [{ id: "asc" }], select: SEL, take: 1200 })
  )
  await step("C: orderBy id, take 1200, cursor p2", async () => {
    const p1 = await db.calculatedMetric.findMany({ where: { companyId: CID }, orderBy: [{ id: "asc" }], select: SEL, take: 1200 })
    return db.calculatedMetric.findMany({
      where: { companyId: CID },
      orderBy: [{ id: "asc" }],
      select: SEL,
      take: 1200,
      skip: 1,
      cursor: { id: p1[p1.length - 1].id },
    })
  })
  await step("D: stmtType filter, orderBy code, take 1200", () =>
    db.calculatedMetric.findMany({
      where: { companyId: CID, statementType: { in: ["CONSOLIDATED", "STANDALONE"] } },
      orderBy: [{ code: "asc" }, { periodKey: "asc" }, { id: "asc" }],
      select: SEL,
      take: 1200,
    })
  )
  await step("E: raw queryRaw count", () => db.$queryRawUnsafe("SELECT COUNT(*) as n FROM CalculatedMetric WHERE companyId = ?", CID))
  process.exit(0)
}

main()
