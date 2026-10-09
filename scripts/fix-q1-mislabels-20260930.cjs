/* Fix Mubasher-earnings FY2026 reports mislabeled as ANNUAL when their NP value
   is provably the Q1 2026 figure (matches the Q1 report within 3%). */
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
const DRY_RUN = process.env.DRY_RUN !== '0';

(async () => {
  const reps = await db.financialReport.findMany({
    where: { sourceName: 'MUBASHER_EARNINGS', periodType: 'ANNUAL', fiscalYear: 2026 },
    select: { id: true, companyId: true, periodLabel: true, periodEnd: true },
  });
  let deleted = 0, relabeled = 0, kept = 0;
  const touched = new Set();
  for (const r of reps) {
    const np = await db.financialValue.findFirst({ where: { reportId: r.id, metricCode: 'NET_PROFIT' }, select: { normalizedValue: true } });
    if (!np) continue;
    const q1cm = await db.calculatedMetric.findFirst({
      where: { companyId: r.companyId, code: 'net_profit', periodType: 'QUARTERLY', fiscalYear: 2026, periodLabel: { contains: 'Q1' }, valueStatus: 'OK' },
      select: { value: true },
    });
    if (!q1cm?.value || Math.abs(np.normalizedValue - q1cm.value) / Math.abs(q1cm.value) >= 0.03) { kept++; continue; }

    // the mislabeled "annual" is provably the Q1 value — does a Q1 2026 QUARTERLY report already carry NP?
    const q1ReportWithValue = await db.financialValue.findFirst({
      where: { metricCode: 'NET_PROFIT', report: { companyId: r.companyId, periodType: 'QUARTERLY', fiscalYear: 2026, periodLabel: { contains: 'Q1' } } },
      select: { reportId: true },
    });
    const c = await db.company.findUnique({ where: { id: r.companyId }, select: { ticker: true } });
    if (q1ReportWithValue) {
      if (!DRY_RUN) {
        await db.financialValue.deleteMany({ where: { reportId: r.id } });
        await db.financialReport.delete({ where: { id: r.id } });
        await db.auditLog.create({ data: { actor: 'system', action: 'REVIEW_EDIT', entityType: 'FinancialReport', entityId: r.id, details: `Deleted Mubasher-earnings FY2026 report mislabeled ANNUAL for ${c.ticker}: NP ${np.normalizedValue} matches existing Q1 2026 report within 3% (Q1 duplicate, periodEnd was Dec-31 placeholder). Backup: dev.db.pre-q1-mislabel-fix-20260930.bak` } });
      }
      deleted++;
    } else {
      if (!DRY_RUN) {
        await db.financialReport.update({ where: { id: r.id }, data: { periodType: 'QUARTERLY', periodLabel: 'Q1 2026', periodKey: 'QUARTERLY:2026:Q1', periodEnd: new Date('2026-03-31') } });
        await db.auditLog.create({ data: { actor: 'system', action: 'REVIEW_EDIT', entityType: 'FinancialReport', entityId: r.id, details: `Relabeled Mubasher-earnings FY2026 ANNUAL -> QUARTERLY Q1 2026 for ${c.ticker}: NP ${np.normalizedValue} matches Q1 pattern (periodEnd was Dec-31 placeholder).` } });
      }
      relabeled++;
    }
    touched.add(r.companyId);
  }
  console.log(JSON.stringify({ total: reps.length, deleted, relabeled, keptVerifiablyAnnual: kept, companiesTouched: touched.size, dryRun: DRY_RUN }));
  await db.$disconnect();
})();
