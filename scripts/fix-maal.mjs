// MAAL targeted remediation — evidence: scripts/maal-dump + AskBorsa harvest
// (truth: NI 2021 +26.24M / 2022 -163K; OCF 17.56M / 51.05M; INV_CF -7.11M / -1.41M;
//  FIN_CF -12.26M / +49.57M; net change -1.81M / +99.21M; equity 133M / 131M).
//  1. FY2021 BASIC/DILUTED_EPS = 125 -> 0.125 (x1000; NI/shares identity: 26,239,975 /
//     207,648,810 = 0.126 — exact at /1000; market-wide EPS sweep found no other case).
//  2. FY2022 NET_PROFIT(,PARENT) -162,573,000 -> -162,573 (harvest -163K AND stored
//     EPS -0.001 = -162,573/207.6M both prove it).
//  3. FY2022 INVESTING_CASH_FLOW -1,405,959,000 -> -1,405,959 (harvest -1.41M exact).
//  4. FY2021 FINANCING_CASH_FLOW +12,256,192 -> -12,256,192 (harvest -12.26M; identity
//     17.557 - 7.115 + (-12.256) = -1.814M = net change -1.81M exact; sign error family).
//  5. FY2022 OCF / FIN / FX / FCF quarantined: the stored cash block breaks every
//     identity (OCF -55.58M vs harvest +51.05M; FIN 80.81M vs 49.57M; neither the
//     stored nor harvest OCF reconciles the stored block), while the harvest rows
//     reconcile exactly among themselves. Not scale-derivable -> quarantine, honest N/A.
// Dry-run by default; --execute to apply.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const EXECUTE = process.argv.includes('--execute')

const c = await db.company.findUnique({ where: { ticker: 'MAAL' }, select: { id: true } })
const FIX = [
  { fy: 2021, code: 'BASIC_EPS', expect: 125, fixed: 0.125 },
  { fy: 2021, code: 'DILUTED_EPS', expect: 125, fixed: 0.125 },
  { fy: 2022, code: 'NET_PROFIT', expect: -162573000, fixed: -162573 },
  { fy: 2022, code: 'NET_PROFIT_PARENT', expect: -162573000, fixed: -162573 },
  { fy: 2022, code: 'INVESTING_CASH_FLOW', expect: -1405959000, fixed: -1405959 },
  { fy: 2021, code: 'FINANCING_CASH_FLOW', expect: 12256192, fixed: -12256192 },
]
const QUA = [
  { fy: 2022, code: 'OPERATING_CASH_FLOW', expect: -55577735 },
  { fy: 2022, code: 'FREE_CASH_FLOW', expect: -55577735 },
  { fy: 2022, code: 'FINANCING_CASH_FLOW', expect: 80812294 },
  { fy: 2022, code: 'FX_EFFECT_CASH', expect: -75380625 },
]

for (const op of [...FIX.map(o => ({ ...o, kind: 'FIX' })), ...QUA.map(o => ({ ...o, kind: 'QUARANTINE' }))]) {
  const vals = await db.financialValue.findMany({
    where: { metricCode: op.code },
    select: { id: true, normalizedValue: true, validationNotes: true, report: { select: { companyId: true, fiscalYear: true, periodType: true } } },
  })
  const hits = vals.filter(v => v.normalizedValue !== null && v.report.companyId === c.id && v.report.fiscalYear === op.fy && v.report.periodType === 'ANNUAL' && Number(v.normalizedValue) === op.expect)
  const skipped = hits.filter(v => (v.validationNotes ?? '').startsWith('AUDIT_QUARANTINE'))
  // values already carrying AUDIT_UNIT_FIX notes (e.g. the /1000 family fixed the
  // magnitude but left a wrong sign / contradiction) may be re-corrected here
  const todo = hits.filter(v => !skipped.includes(v))
  console.log(`${op.kind.padEnd(10)} FY${op.fy} ${op.code.padEnd(22)} expect=${op.expect.toLocaleString()} hits=${hits.length} todo=${todo.length}`)
  if (todo.length !== 1) { console.log(`  !! expected exactly 1, got ${todo.length}`); continue }
  const v = todo[0]
  if (!EXECUTE) continue
  if (op.kind === 'FIX') {
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        normalizedValue: op.fixed, originalValue: op.expect, correctedBy: 'audit-unit-fix',
        validationNotes: `AUDIT_UNIT_FIX: MAAL unit/sign fix — ${op.code} ${op.expect.toLocaleString()} -> ${op.fixed.toLocaleString()} (AskBorsa harvest + NI/shares and cash-flow identities; see scripts/fix-maal.mjs).`,
      },
    })
  } else {
    await db.financialValue.update({
      where: { id: v.id },
      data: {
        validationStatus: 'NEEDS_REVIEW',
        validationNotes: `AUDIT_QUARANTINE: MAAL FY2022 cash-flow block breaks every identity (AskBorsa rows reconcile exactly: 51.05 - 1.41 + 49.57 = 99.21M); stored value contradicts ground truth — awaiting re-extraction.`,
      },
    })
  }
}
console.log(EXECUTE ? 'done' : 'DRY RUN — pass --execute')
await db.$disconnect()
