// Evidence-based corrections from the AskBorsa annual cross-check.
//
//   node scripts/dq-fix-askborsa-mismatches.mjs            # dry run
//   node scripts/dq-fix-askborsa-mismatches.mjs --apply    # write
//   node scripts/dq-fix-askborsa-mismatches.mjs --rollback # undo last apply
//
// Every correction below has a printed source (AskBorsa annual summary) and an
// old value guard, so the script is idempotent and refuses to overwrite a value
// that changed after the audit. Corrections are reversible through
// reports/askborsa-mismatch-rollback.json.
//
// Scope is deliberately narrow:
//   * exact scale slips (×10 / ×100 / ×1000) corroborated by the company's own
//     quarterly data or by AskBorsa
//   * equity sign errors (AskBorsa prints a negative equity; app stored positive)
//   * fabricated template values (UASG equity equal to another company's assets)
//   * values that are plainly from another period/company and can be replaced
//     with the AskBorsa annual figure (SIPC 2025, COPR 2024, UNIT 2024)
// Anything ambiguous (different fiscal-year labelling, parent vs total, USD
// reporting) is NOT changed here — it is listed for manual review instead.
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const APPLY = process.argv.includes("--apply")
const ROLLBACK = process.argv.includes("--rollback")
const PATH = "reports/askborsa-mismatch-rollback.json"

const CORRECTIONS = [
  // --- exact scale slips -------------------------------------------------
  { ticker: "ELKA", year: 2024, metric: "NET_PROFIT", old: 11_800_000, new: 1_180_000_000,
    note: "stored value was exactly 1/100 of AskBorsa FY2024 net profit 1.18bn; Q1 2024 alone is 1.15bn" },
  { ticker: "MHOT", year: 2025, metric: "NET_PROFIT", old: 138_939_316, new: 1_389_393_160,
    note: "stored value was exactly 1/10 of AskBorsa FY2025 net profit 1.39bn" },
  { ticker: "GRCA", year: 2026, metric: "NET_PROFIT", old: 27_400, new: 27_400_000,
    note: "stored value was exactly 1/1000 of AskBorsa FY2026 net profit 27.4m" },

  // --- equity sign errors (AskBorsa prints negative equity) ---------------
  { ticker: "SCFM", year: 2025, metric: "TOTAL_EQUITY", old: 7_360_000, new: -7_360_000,
    note: "AskBorsa FY2025 equity is −7.36m (accumulated losses), not +7.36m; positive sign produced a fake 82% ROE" },
  { ticker: "PRCL", year: 2025, metric: "TOTAL_EQUITY", old: 174_000_000, new: -174_000_000,
    note: "AskBorsa FY2025 equity is −174m, not +174m" },
  { ticker: "AALR", year: 2025, metric: "TOTAL_EQUITY", old: 503_000_000, new: -503_000_000,
    note: "AskBorsa FY2025 equity is −503m, not +503m" },
  { ticker: "ALEX", year: 2019, metric: "TOTAL_EQUITY", old: 277_000_000, new: -277_000_000,
    note: "AskBorsa FY2019 equity is −277m, not +277m" },

  // --- fabricated template / wrong-company values ------------------------
  { ticker: "UASG", year: 2024, metric: "TOTAL_EQUITY", old: 514_007_177.67, new: -258_000_000,
    note: "514,007,177.67 is a fabricated template duplicate (equals PRCL total assets); AskBorsa FY2024 equity is −258m" },
  { ticker: "COPR", year: 2024, metric: "TOTAL_ASSETS", old: 151_770, new: 95_050_000,
    note: "stored 151,770 is not a balance-sheet scale; AskBorsa FY2024 total assets are 95.05m" },
  { ticker: "COPR", year: 2024, metric: "TOTAL_EQUITY", old: -6_060_609, new: 81_230_000,
    note: "AskBorsa FY2024 equity is +81.23m; stored negative value was wrong" },
  { ticker: "COPR", year: 2024, metric: "NET_PROFIT", old: -3_712_047, new: 4_010_000,
    note: "AskBorsa FY2024 net profit is +4.01m; stored value was negative" },
  { ticker: "EGAS", year: 2024, metric: "NET_PROFIT", old: -248_049.30288, new: 291_000_000,
    note: "AskBorsa FY2024 net profit is 291m; stored −248k was a unit/parse error" },
  { ticker: "SIPC", year: 2025, metric: "TOTAL_ASSETS", old: 8_294_717_672, new: 169_000_000,
    note: "AskBorsa FY2025 total assets are 169m; stored 8.29bn is another company/scale" },
  { ticker: "SIPC", year: 2025, metric: "TOTAL_EQUITY", old: 6_020_338_736, new: 106_000_000,
    note: "AskBorsa FY2025 equity is 106m; stored 6.02bn is another company/scale" },
  { ticker: "GSSC", year: 2025, metric: "NET_PROFIT", old: 265_160_968.67, new: 135_000_000,
    note: "AskBorsa FY2025 net profit is 135m; stored 265m double-counted an annual-copy quarter" },
  { ticker: "GSSC", year: 2025, metric: "TOTAL_EQUITY", old: 396_713_586.06, new: 778_000_000,
    note: "AskBorsa FY2025 equity is 778m; stored 396.7m came from the same bad annual copy" },
  { ticker: "UNIT", year: 2024, metric: "NET_PROFIT", old: 58_400_000, new: 130_000_000,
    note: "AskBorsa FY2024 net profit is 130m; stored 58.4m does not match the issuer" },
  { ticker: "UNIT", year: 2024, metric: "TOTAL_ASSETS", old: 5_282_100_000, new: 1_920_000_000,
    note: "AskBorsa FY2024 total assets are 1.92bn; stored 5.28bn does not match the issuer" },
  { ticker: "UNIT", year: 2024, metric: "TOTAL_EQUITY", old: 2_452_400_000, new: 795_000_000,
    note: "AskBorsa FY2024 equity is 795m; stored 2.45bn does not match the issuer" },
]

const ADDITIONS = [
  { ticker: "GRCA", year: 2026, metric: "TOTAL_EQUITY", value: 80_660_000,
    label: "حقوق المساهمين (AskBorsa annual)", note: "added AskBorsa FY2026 equity 80.66m after net-profit scale fix" },
  { ticker: "SIPC", year: 2025, metric: "NET_PROFIT", value: -6_650_000,
    label: "صافي الربح (AskBorsa annual)", note: "added AskBorsa FY2025 net profit −6.65m after assets/equity correction" },
]

const QUARANTINES = [
  { ticker: "UNIT", year: 2025, metrics: ["NET_PROFIT", "TOTAL_ASSETS", "TOTAL_EQUITY"],
    reason: "FY2025 figures (1.03bn profit / 12.04bn assets / 380m equity) conflict with AskBorsa FY2024 (130m / 1.92bn / 795m) and are unverified; requires re-extraction" },
  { ticker: "GSSC", year: 2025, periodLabelLike: "Q4", metrics: ["NET_PROFIT"],
    reason: "Q4 2025 net profit equals the corrected FY2025 annual figure (annual-copy contamination)" },
  { ticker: "OFH", year: 2025, metrics: ["NET_PROFIT"],
    reason: "153k FY2025 profit is implausible vs 40.9m in FY2024 and AskBorsa's FY2024 loss; Reuters scale error suspected" },
]

function close(a, b) {
  if (a === b) return true
  const scale = Math.max(Math.abs(a), Math.abs(b), 1)
  return Math.abs(a - b) / scale < 1e-6
}

async function findAnnualReport(companyId, year, periodLabelLike) {
  const where = { companyId, fiscalYear: year, periodType: "ANNUAL" }
  if (periodLabelLike) where.periodLabel = { contains: periodLabelLike }
  return db.financialReport.findFirst({
    where,
    orderBy: [{ statementType: "asc" }, { createdAt: "desc" }],
    select: { id: true, statementType: true, periodLabel: true, sourceName: true },
  })
}

async function findQuarterReport(companyId, year, periodLabelLike) {
  return db.financialReport.findFirst({
    where: { companyId, fiscalYear: year, periodType: "QUARTERLY", periodLabel: { contains: periodLabelLike } },
    orderBy: { createdAt: "desc" },
    select: { id: true, statementType: true, periodLabel: true, sourceName: true },
  })
}

async function findValue(reportId, metric) {
  return db.financialValue.findFirst({
    where: { reportId, metricCode: metric },
    orderBy: [{ subPeriod: "asc" }],
    select: { id: true, normalizedValue: true, validationStatus: true, validationNotes: true, originalValue: true, isManuallyCorrected: true },
  })
}

async function main() {
  if (ROLLBACK) {
    if (!existsSync(PATH)) throw new Error(`No rollback file at ${PATH}`)
    const data = JSON.parse(readFileSync(PATH, "utf8"))
    let n = 0
    for (const c of data.corrections ?? []) {
      const v = await db.financialValue.findUnique({ where: { id: c.id } })
      if (!v) continue
      await db.financialValue.update({
        where: { id: c.id },
        data: {
          normalizedValue: c.oldValue,
          validationStatus: c.oldStatus,
          validationNotes: c.oldNotes,
          originalValue: c.oldOriginalValue,
          isManuallyCorrected: c.oldIsManuallyCorrected,
          correctedBy: null,
          correctedAt: null,
          correctionReason: null,
        },
      })
      n++
    }
    for (const a of data.additions ?? []) {
      await db.financialValue.delete({ where: { id: a.id } }).catch(() => {})
      n++
    }
    for (const q of data.quarantines ?? []) {
      await db.financialValue.update({
        where: { id: q.id },
        data: { validationStatus: q.oldStatus, validationNotes: q.oldNotes },
      }).catch(() => {})
      n++
    }
    console.log(`Rolled back ${n} change(s) from ${PATH}`)
    return
  }

  const rollback = { corrections: [], additions: [], quarantines: [] }

  for (const c of CORRECTIONS) {
    const company = await db.company.findUnique({ where: { ticker: c.ticker }, select: { id: true } })
    if (!company) { console.log(`SKIP ${c.ticker}: company missing`); continue }
    const report = await findAnnualReport(company.id, c.year)
    if (!report) { console.log(`SKIP ${c.ticker} ${c.year} ${c.metric}: annual report missing`); continue }
    const v = await findValue(report.id, c.metric)
    if (!v) { console.log(`SKIP ${c.ticker} ${c.year} ${c.metric}: value missing`); continue }
    if (close(v.normalizedValue, c.new)) { console.log(`OK   ${c.ticker} ${c.year} ${c.metric} already ${c.new}`); continue }
    if (!close(v.normalizedValue, c.old)) {
      console.log(`SKIP ${c.ticker} ${c.year} ${c.metric}: current ${v.normalizedValue} != expected old ${c.old}`)
      continue
    }
    console.log(`FIX  ${c.ticker} ${c.year} ${c.metric}: ${v.normalizedValue} -> ${c.new}`)
    rollback.corrections.push({
      id: v.id, ticker: c.ticker, year: c.year, metric: c.metric,
      oldValue: v.normalizedValue, oldStatus: v.validationStatus, oldNotes: v.validationNotes,
      oldOriginalValue: v.originalValue, oldIsManuallyCorrected: v.isManuallyCorrected,
    })
    if (APPLY) {
      await db.financialValue.update({
        where: { id: v.id },
        data: {
          normalizedValue: c.new,
          originalValue: v.originalValue ?? v.normalizedValue,
          isManuallyCorrected: true,
          correctedBy: "askborsa-audit",
          correctedAt: new Date(),
          correctionReason: c.note,
          validationStatus: "VALID",
          validationNotes: `AUDIT_CORRECTION: ${c.note} (source: AskBorsa annual summary)`,
        },
      })
    }
  }

  for (const a of ADDITIONS) {
    const company = await db.company.findUnique({ where: { ticker: a.ticker }, select: { id: true } })
    if (!company) { console.log(`SKIP ${a.ticker}: company missing`); continue }
    const report = await findAnnualReport(company.id, a.year)
    if (!report) { console.log(`SKIP ${a.ticker} ${a.year} ${a.metric}: annual report missing`); continue }
    const existing = await findValue(report.id, a.metric)
    if (existing) {
      if (close(existing.normalizedValue, a.value)) { console.log(`OK   ${a.ticker} ${a.year} ${a.metric} already ${a.value}`); continue }
      console.log(`SKIP ${a.ticker} ${a.year} ${a.metric}: already exists with ${existing.normalizedValue}`)
      continue
    }
    console.log(`ADD  ${a.ticker} ${a.year} ${a.metric}: ${a.value}`)
    if (APPLY) {
      const created = await db.financialValue.create({
        data: {
          companyId: company.id,
          reportId: report.id,
          metricCode: a.metric,
          originalLabel: a.label,
          value: a.value,
          currency: "EGP",
          unit: "UNIT",
          normalizedValue: a.value,
          statementType: report.statementType,
          subPeriod: "CURRENT",
          extractionMethod: "MANUAL_ENTRY",
          confidence: 1,
          validationStatus: "VALID",
          validationNotes: `AUDIT_CORRECTION: ${a.note} (source: AskBorsa annual summary)`,
        },
        select: { id: true },
      })
      rollback.additions.push({ id: created.id, ticker: a.ticker, year: a.year, metric: a.metric })
    }
  }

  for (const q of QUARANTINES) {
    const company = await db.company.findUnique({ where: { ticker: q.ticker }, select: { id: true } })
    if (!company) { console.log(`SKIP ${q.ticker}: company missing`); continue }
    const report = q.periodLabelLike
      ? await findQuarterReport(company.id, q.year, q.periodLabelLike)
      : await findAnnualReport(company.id, q.year)
    if (!report) { console.log(`SKIP ${q.ticker} ${q.year}: report missing`); continue }
    for (const metric of q.metrics) {
      const v = await findValue(report.id, metric)
      if (!v) { console.log(`SKIP ${q.ticker} ${q.year} ${metric}: value missing`); continue }
      if (v.validationStatus === "NEEDS_REVIEW" && (v.validationNotes ?? "").includes(q.reason)) {
        console.log(`OK   ${q.ticker} ${q.year} ${metric} already quarantined`)
        continue
      }
      console.log(`QUAR ${q.ticker} ${q.year} ${metric}: ${v.normalizedValue}`)
      rollback.quarantines.push({ id: v.id, ticker: q.ticker, year: q.year, metric, oldStatus: v.validationStatus, oldNotes: v.validationNotes })
      if (APPLY) {
        await db.financialValue.update({
          where: { id: v.id },
          data: {
            validationStatus: "NEEDS_REVIEW",
            validationNotes: `AUDIT_QUARANTINE: ${q.reason}`,
          },
        })
      }
    }
  }

  if (APPLY) {
    mkdirSync("reports", { recursive: true })
    writeFileSync(PATH, JSON.stringify(rollback, null, 2), "utf8")
    console.log(`\nApplied. Rollback: ${PATH}`)
  } else {
    console.log("\nDry run — re-run with --apply to write.")
  }
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
