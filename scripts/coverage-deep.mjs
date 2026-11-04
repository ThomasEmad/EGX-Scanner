import { PrismaClient } from '@prisma/client';
const db = new PrismaClient();
const rows = await db.$queryRawUnsafe(`
  SELECT c.ticker, c.nameEn, c.sector, c.listingStatus,
         COUNT(r.id) as rc,
         SUM(CASE WHEN r.periodType='ANNUAL' THEN 1 ELSE 0 END) as annual,
         MAX(r.fiscalYear) as latestFY,
         MIN(r.fiscalYear) as earliestFY,
         SUM(CASE WHEN r.periodLabel LIKE 'FY 2025%' THEN 1 ELSE 0 END) as fy25
  FROM Company c
  LEFT JOIN FinancialReport r ON r.companyId = c.id AND r.deletedAt IS NULL
  GROUP BY c.id ORDER BY annual DESC
`);
console.log('total=' + rows.length);
const zeroData = rows.filter(r => Number(r.rc) === 0);
const noAnnual = rows.filter(r => Number(r.annual) === 0 && Number(r.rc) > 0);
const latest2025 = rows.filter(r => Number(r.fy25) > 0);
const latestFY = {};
for (const r of rows) { const y = String(r.latestFY); latestFY[y] = (latestFY[y] || 0) + 1; }
console.log('== Companies with ZERO reports:', zeroData.length, '=>', zeroData.slice(0, 30).map(r => r.ticker).join(','));
console.log('== Companies with reports but NO ANNUAL:', noAnnual.length, '=>', noAnnual.map(r => r.ticker).join(','));
console.log('== Companies having FY2025 data:', latest2025.length, '/', rows.length);
console.log('== Latest FY distribution:', JSON.stringify(latestFY));
await db.$disconnect();
