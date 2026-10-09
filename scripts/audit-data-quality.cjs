/**
 * audit-data-quality.cjs — periodic universe & data-quality audit.
 * Run: node --env-file=.env scripts/audit-data-quality.cjs
 * Exit code 0 = clean, 1 = failures found (usable as a cron gate).
 *
 * Checks:
 *  1. Placeholder/duplicate ISINs (the universe builder shipped ~66 rows with
 *     fallback ISIN EGS02091C019 — none of those may enter the DB)
 *  2. Never-listed state entities must not exist
 *  3. Canonical sector corrections are enforced
 *  4. ISIN coverage (informational — nulls are acceptable, wrong values are not)
 *  5. Identity validation health (share of imported reports failing the
 *     balance-sheet identity, from stored BALANCE_SHEET_IDENTITY rows)
 *  6. Data freshness (latest trusted report period-end per company; stale if
 *     older than 15 months)
 */

const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient({ log: ["error"] })

const PLACEHOLDER_ISINS = new Set(["EGS02091C019"])
const NEVER_LISTED = new Set(["EGPC", "NILE", "BTEG"])
const CANONICAL_SECTORS = {
  FWRY: "Financial Services",
  EFID: "Food",
  RREI: "Real Estate",
  NREH: "Banks",
  EGAS: "Energy",
  BTFH: "Financial Services",
  ORWE: "Consumer",
}

async function main() {
  const failures = []
  const warnings = []
  const infos = []

  // 1. placeholder ISINs
  const ph = await db.company.count({ where: { isin: { in: [...PLACEHOLDER_ISINS] } } })
  if (ph > 0) failures.push(`placeholder ISIN rows present: ${ph} (must be 0)`)
  else infos.push("no placeholder ISINs in DB")

  // duplicate ISINs across different companies
  const dupRows = await db.$queryRawUnsafe(
    `SELECT isin, COUNT(*) n FROM Company WHERE isin IS NOT NULL GROUP BY isin HAVING n > 1`
  )
  if (dupRows.length) failures.push(`duplicate ISINs: ${dupRows.map((r) => r.isin + "×" + Number(r.n)).join(", ")}`)
  else infos.push("no duplicate ISINs")

  // 2. never-listed entities
  for (const ticker of NEVER_LISTED) {
    const c = await db.company.findUnique({ where: { ticker } })
    if (c) failures.push(`never-listed entity present: ${ticker}`)
  }

  // 3. canonical sectors
  for (const [ticker, want] of Object.entries(CANONICAL_SECTORS)) {
    const c = await db.company.findUnique({ where: { ticker }, select: { sector: true } })
    if (c && c.sector !== want) failures.push(`sector drift: ${ticker}=${c.sector}, expected ${want}`)
  }

  // 4. ISIN coverage
  const [withIsin, total] = [await db.company.count({ where: { isin: { not: null } } }), await db.company.count()]
  infos.push(`ISIN coverage: ${withIsin}/${total} (null is acceptable; wrong is not)`)

  // 5. identity health on imported reports
  const [passed, failed] = await Promise.all([
    db.financialValidationResult.count({ where: { checkName: "BALANCE_SHEET_IDENTITY", status: "PASSED" } }),
    db.financialValidationResult.count({ where: { checkName: "BALANCE_SHEET_IDENTITY", status: "FAILED" } }),
  ])
  const totalChecks = passed + failed
  if (totalChecks === 0) warnings.push("no BALANCE_SHEET_IDENTITY rows found — import not run?")
  else {
    const failPct = (failed / totalChecks) * 100
    infos.push(`balance identity: ${passed}/${totalChecks} passed (${failPct.toFixed(1)}% failed)`)
    if (failPct > 30) warnings.push(`identity failure rate high: ${failPct.toFixed(1)}%`)
  }

  // 6. freshness: latest trusted report period-end per active company
  // (Prisma stores DateTime as integer ms in SQLite — convert via unixepoch)
  const stale = await db.$queryRawUnsafe(`
    SELECT c.ticker, MAX(r.periodEnd) as latest FROM Company c
    JOIN FinancialReport r ON r.companyId = c.id
    WHERE c.isActive = 1 AND r.processingStatus IN ('APPROVED','VALIDATED','EXTRACTED')
    GROUP BY c.id
    HAVING julianday(MAX(r.periodEnd) / 1000.0, 'unixepoch') < julianday('now', '-15 months')`)
  if (stale.length) {
    warnings.push(`companies with stale data (>15 months): ${stale.map((s) => s.ticker).slice(0, 12).join(", ")}${stale.length > 12 ? "…" : ""} (${stale.length} total)`)
  }
  const noData = await db.$queryRawUnsafe(`
    SELECT COUNT(*) n FROM Company c WHERE c.isActive = 1 AND NOT EXISTS (
      SELECT 1 FROM FinancialReport r WHERE r.companyId = c.id AND r.processingStatus IN ('APPROVED','VALIDATED','EXTRACTED'))`)
  infos.push(`active companies without any trusted data: ${Number(noData[0].n)}`)

  console.log("== EGX data-quality audit ==")
  for (const i of infos) console.log("INFO  " + i)
  for (const w of warnings) console.log("WARN  " + w)
  for (const f of failures) console.log("FAIL  " + f)
  console.log(`result: ${failures.length === 0 ? "PASS" : "FAIL"} (${failures.length} failures, ${warnings.length} warnings)`)
  process.exitCode = failures.length === 0 ? 0 : 1
}

main()
  .catch((e) => { console.error("AUDIT ERROR:", e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
