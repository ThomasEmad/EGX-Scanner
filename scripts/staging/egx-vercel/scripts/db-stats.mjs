import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();

const companies = await db.company.count();
const active = await db.company.count({ where: { isActive: true } });
const reports = await db.financialReport.count();
const values = await db.financialValue.count();
const calc = await db.calculatedMetric.count();
const prices = await db.marketPrice.count();
const dividends = await db.dividend.count();
const events = await db.financialEvent.count();
console.log(JSON.stringify({ companies, active, reports, values, calc, prices, dividends, events }, null, 2));

// Sector breakdown
const bySector = await db.company.groupBy({ by: ['sector'], _count: { id: true } });
console.log('Sectors:', bySector.map(s => `${s.sector}: ${s._count.id}`).join(', '));

// Latest fiscal year per company (annual reports)
const latest = await db.$queryRawUnsafe(`
  SELECT c.ticker, MAX(r.fiscalYear) as latestFY, COUNT(r.id) as reportCount
  FROM Company c
  LEFT JOIN FinancialReport r ON r.companyId = c.id AND r.periodType = 'ANNUAL' AND r.deletedAt IS NULL
  GROUP BY c.id ORDER BY reportCount DESC LIMIT 5
`);
console.log('Sample coverage:', JSON.stringify(latest, null, 2));
await db.$disconnect();
