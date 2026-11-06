// Reversibly deactivate alternate tickers that duplicate an existing issuer and
// carry no disclosures of their own.  No company, report, or value is deleted.
//
//   node scripts/quarantine-company-aliases.mjs            # dry run
//   node scripts/quarantine-company-aliases.mjs --apply    # deactivate + rollback
//   node scripts/quarantine-company-aliases.mjs --rollback # reactivate
import { PrismaClient } from "@prisma/client"
import { readFileSync, writeFileSync, existsSync } from "node:fs"

const db = new PrismaClient()
const ROLLBACK = "reports/company-alias-quarantine.json"
const APPLY = process.argv.includes("--apply")
const ROLLBACK_MODE = process.argv.includes("--rollback")

// Alternate ticker -> canonical ticker with the disclosure history.
const ALIASES = {
  CNFG: "CNFN",
  CPC: "POUL",
  DOMTY: "DOMT",
  EDBE: "EXPA",
  IBPH: "ISPH",
  MNHD: "MASR",
  OPHC: "EMFD",
  PHAE: "PHAR",
  RMDT: "RMDA",
  SBAG: "CANA",
  EZDK: "ESRS",
  EIPC: "IRON",
  QNBA: "QNBE",
}

// Aliases that already carry disclosures.  Deactivate only when the canonical
// issuer has strictly more reports and the alias is a duplicate ticker, not a
// competing data source.  Reports and values are preserved.
const FORCE_ALIASES = {
  MOPCO: "MFPC",
}

async function runRollback() {
  if (!existsSync(ROLLBACK)) { console.error(`No ${ROLLBACK}`); process.exit(1) }
  const data = JSON.parse(readFileSync(ROLLBACK, "utf8"))
  let reverted = 0, skipped = 0
  for (const row of data.deactivated ?? []) {
    const c = await db.company.findUnique({ where: { ticker: row.ticker } })
    if (!c || c.isActive) { skipped++; continue }
    await db.company.update({ where: { ticker: row.ticker }, data: { isActive: true } })
    reverted++
  }
  console.log(`rollback complete: reactivated=${reverted}, skipped=${skipped}`)
}

async function main() {
  if (ROLLBACK_MODE) return runRollback()
  const deactivated = []
  const skipped = []
  const allAliases = [...Object.entries(ALIASES), ...Object.entries(FORCE_ALIASES)]
  for (const [aliasTicker, canonicalTicker] of allAliases) {
    const force = Object.prototype.hasOwnProperty.call(FORCE_ALIASES, aliasTicker)
    const alias = await db.company.findUnique({
      where: { ticker: aliasTicker },
      select: { id: true, ticker: true, isActive: true, _count: { select: { reports: true, values: true } } },
    })
    const canonical = await db.company.findUnique({
      where: { ticker: canonicalTicker },
      select: { id: true, ticker: true, isActive: true, _count: { select: { reports: true } } },
    })
    if (!alias) { skipped.push({ ticker: aliasTicker, reason: "ALIAS_NOT_FOUND" }); continue }
    if (!canonical || canonical._count.reports === 0) {
      skipped.push({ ticker: aliasTicker, reason: "CANONICAL_NOT_FOUND_OR_EMPTY", canonical: canonicalTicker })
      continue
    }
    if (force) {
      if (canonical._count.reports <= alias._count.reports) {
        skipped.push({
          ticker: aliasTicker, reason: "CANONICAL_NOT_LARGER", canonical: canonicalTicker,
          aliasReports: alias._count.reports, canonicalReports: canonical._count.reports,
        })
        continue
      }
    } else if (alias._count.reports > 0 || alias._count.values > 0) {
      skipped.push({
        ticker: aliasTicker, reason: "ALIAS_HAS_DATA", canonical: canonicalTicker,
        reports: alias._count.reports, values: alias._count.values,
      })
      continue
    }
    if (!alias.isActive) { skipped.push({ ticker: aliasTicker, reason: "ALREADY_INACTIVE" }); continue }
    deactivated.push({ ticker: aliasTicker, canonical: canonicalTicker, companyId: alias.id, forced: force })
  }

  console.log(`mode: ${APPLY ? "APPLY" : "DRY RUN"}`)
  console.log(`aliases to deactivate: ${deactivated.length}`)
  console.log(JSON.stringify(deactivated, null, 2))
  console.log(`skipped: ${JSON.stringify(skipped, null, 2)}`)
  if (!APPLY) return

  for (const row of deactivated) {
    await db.company.update({ where: { ticker: row.ticker }, data: { isActive: false } })
    await db.auditLog.create({
      data: {
        actor: "system",
        action: "VALIDATE",
        entityType: "Company",
        entityId: row.companyId,
        details: `AUDIT_QUARANTINE: alternate ticker ${row.ticker} deactivated; canonical issuer is ${row.canonical}. ${row.forced ? "Alias carries duplicate disclosures; reports/values preserved." : "Zero reports/values."} Reversible via scripts/quarantine-company-aliases.mjs --rollback.`,
      },
    })
  }
  const existing = existsSync(ROLLBACK) ? JSON.parse(readFileSync(ROLLBACK, "utf8")) : { deactivated: [] }
  const merged = [
    ...(existing.deactivated ?? []).filter((old) => !deactivated.some((row) => row.ticker === old.ticker)),
    ...deactivated,
  ]
  writeFileSync(ROLLBACK, JSON.stringify({ generatedAt: new Date().toISOString(), deactivated: merged, skipped }, null, 2), "utf8")
  console.log(`deactivated: ${deactivated.length}; rollback: ${ROLLBACK}`)
}

main()
  .catch((e) => { console.error("COMPANY ALIAS QUARANTINE FAILED:", e); process.exitCode = 1 })
  .finally(async () => { await db.$disconnect() })
