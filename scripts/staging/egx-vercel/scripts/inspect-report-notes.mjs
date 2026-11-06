import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const ticker = process.argv[2]
const company = await db.company.findUnique({ where: { ticker }, select: { id: true, ticker: true, nameEn: true } })
if (!company) throw new Error("company not found")
const reports = await db.financialReport.findMany({
  where: { companyId: company.id, periodType: "ANNUAL" },
  select: { periodLabel: true, fiscalYear: true, periodStart: true, periodEnd: true, sourceName: true, notes: true },
  orderBy: { fiscalYear: "desc" },
})
console.log(JSON.stringify({ company, reports }, null, 2))
await db.$disconnect()
