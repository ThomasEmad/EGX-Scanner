// Seed: clearly-labeled SYNTHETIC DEMO dataset (spec #41).
// 10 companies from different industries, multi-period financials, dividends,
// preset scanner rules. Every seeded row is flagged isDemoData=true and every
// report's sourceName explicitly says it is synthetic demo data — never real EGX data.

import { PrismaClient } from "@prisma/client"
import { RAW_METRICS } from "../src/lib/financial/registry"
import { normalizeToEgp } from "../src/lib/financial/units"
import { recomputeAll } from "../src/lib/financial/recompute"

const db = new PrismaClient()

type Values = Record<string, number>

interface SeedPeriod {
  label: string
  year: number
  start: string // ISO date
  end: string
  pub: string
  v: Values
}

interface SeedCompany {
  ticker: string
  nameEn: string
  nameAr: string
  sector: string
  industry: string
  shares: number // millions of shares
  descriptionEn: string
  descriptionAr: string
  annual: SeedPeriod[]
  quarterly: SeedPeriod[]
  dividends: {
    announcementDate?: string
    eligibilityDate?: string
    exDividendDate?: string
    distributionDate?: string
    dividendPerShare?: number
    dividendType?: string
    status: string
    notes?: string
  }[]
}

function deriveGrossProfit(v: Values): Values {
  if (v["REVENUE"] !== undefined && v["COGS"] !== undefined && v["GROSS_PROFIT"] === undefined) {
    return { ...v, GROSS_PROFIT: v["REVENUE"] - v["COGS"] }
  }
  return v
}

async function main() {
  console.log("Seeding EGX Financial Scanner demo dataset...")

  // Clean slate (dev/demo reset)
  await db.auditLog.deleteMany()
  await db.scannerRun.deleteMany()
  await db.scannerRule.deleteMany()
  await db.financialEvent.deleteMany()
  await db.calculatedMetric.deleteMany()
  await db.financialValue.deleteMany()
  await db.financialReport.deleteMany()
  await db.dividend.deleteMany()
  await db.company.deleteMany()
  await db.metricDefinition.deleteMany()
  await db.dataSource.deleteMany()

  await db.dataSource.create({
    data: { name: "Synthetic Demo Dataset", kind: "SEED_DEMO", isActive: true, config: null },
  })
  await db.dataSource.create({
    data: { name: "Manual Upload", kind: "MANUAL_UPLOAD", isActive: true },
  })

  // Metric registry
  for (const m of RAW_METRICS) {
    await db.metricDefinition.create({
      data: {
        code: m.code,
        labelEn: m.labelEn,
        labelAr: m.labelAr,
        statementType: m.statementType,
        description: m.description ?? null,
        aliases: JSON.stringify(m.aliases),
        appliesToSectors: m.appliesToSectors ? JSON.stringify(m.appliesToSectors) : null,
        calcRole: "INPUT",
      },
    })
  }

  const C = (companies: SeedCompany[]) => companies

  const companies = C([
    {
      ticker: "DBNK",
      nameEn: "Demo Nile Bank",
      nameAr: "بنك النيل التجريبي",
      sector: "Banks",
      industry: "Commercial Banking",
      shares: 8250,
      descriptionEn: "A large demo commercial bank with strong profitability and recurring dividends.",
      descriptionAr: "بنك تجاري تجريبي كبير بربحية قوية وتوزيعات منتظمة.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-03-20", v: { REVENUE: 21000, NET_INTEREST_INCOME: 15000, NET_PROFIT: 6500, TOTAL_ASSETS: 190000, TOTAL_LIABILITIES: 172000, TOTAL_EQUITY: 18000, TOTAL_DEBT: 8000, DEPOSITS: 150000, LOANS_NET: 95000, OPERATING_CASH_FLOW: 9000 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-03-18", v: { REVENUE: 24500, NET_INTEREST_INCOME: 18000, NET_PROFIT: 8200, TOTAL_ASSETS: 210000, TOTAL_LIABILITIES: 189500, TOTAL_EQUITY: 20500, TOTAL_DEBT: 8500, DEPOSITS: 168000, LOANS_NET: 110000, OPERATING_CASH_FLOW: 10500 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-17", v: { REVENUE: 28600, NET_INTEREST_INCOME: 21500, NET_PROFIT: 9900, TOTAL_ASSETS: 235000, TOTAL_LIABILITIES: 211500, TOTAL_EQUITY: 23500, TOTAL_DEBT: 9000, DEPOSITS: 190000, LOANS_NET: 126000, OPERATING_CASH_FLOW: 12200 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-21", v: { REVENUE: 5600, NET_INTEREST_INCOME: 4200, NET_PROFIT: 2100, TOTAL_ASSETS: 218000, TOTAL_LIABILITIES: 197000, TOTAL_EQUITY: 21000, TOTAL_DEBT: 8100, DEPOSITS: 172000, LOANS_NET: 112000, OPERATING_CASH_FLOW: 2400 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-20", v: { REVENUE: 5900, NET_INTEREST_INCOME: 4450, NET_PROFIT: 2250, TOTAL_ASSETS: 222000, TOTAL_LIABILITIES: 200600, TOTAL_EQUITY: 21400, TOTAL_DEBT: 8200, DEPOSITS: 175000, LOANS_NET: 115000, OPERATING_CASH_FLOW: 2600 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-20", v: { REVENUE: 6800, NET_INTEREST_INCOME: 5100, NET_PROFIT: 2500, TOTAL_ASSETS: 228000, TOTAL_LIABILITIES: 205900, TOTAL_EQUITY: 22100, TOTAL_DEBT: 8400, DEPOSITS: 180000, LOANS_NET: 119000, OPERATING_CASH_FLOW: 2900 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-19", v: { REVENUE: 7100, NET_INTEREST_INCOME: 5350, NET_PROFIT: 2650, TOTAL_ASSETS: 232000, TOTAL_LIABILITIES: 209400, TOTAL_EQUITY: 22600, TOTAL_DEBT: 8600, DEPOSITS: 184000, LOANS_NET: 123000, OPERATING_CASH_FLOW: 3100 } },
      ],
      dividends: [
        { announcementDate: "2025-03-18", eligibilityDate: "2025-04-05", exDividendDate: "2025-04-07", distributionDate: "2025-04-28", dividendPerShare: 1.2, status: "PAID", dividendType: "CASH" },
        { announcementDate: "2025-11-18", eligibilityDate: "2025-12-11", exDividendDate: "2025-12-14", distributionDate: "2025-12-30", dividendPerShare: 1.45, status: "ANNOUNCED", dividendType: "CASH" },
      ],
    },
    {
      ticker: "DRES",
      nameEn: "Demo Delta Real Estate",
      nameAr: "دلتا للتطوير العقاري (تجريبي)",
      sector: "Real Estate",
      industry: "Real Estate Development",
      shares: 3400,
      descriptionEn: "Asset-heavy demo real estate developer; debt reduction and improving cash flow.",
      descriptionAr: "شركة تطوير عقاري تجريبية ذات أصول كبيرة؛ خفض ديون وتحسن التدفق النقدي.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-04-02", v: { REVENUE: 3200, COGS: 1900, NET_PROFIT: 410, TOTAL_ASSETS: 38000, TOTAL_LIABILITIES: 29000, TOTAL_EQUITY: 9000, TOTAL_DEBT: 12000, OPERATING_CASH_FLOW: -350 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-04-01", v: { REVENUE: 3900, COGS: 2300, NET_PROFIT: 560, TOTAL_ASSETS: 41500, TOTAL_LIABILITIES: 31000, TOTAL_EQUITY: 10500, TOTAL_DEBT: 11500, OPERATING_CASH_FLOW: -120 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-30", v: { REVENUE: 4550, COGS: 2700, NET_PROFIT: 730, TOTAL_ASSETS: 45200, TOTAL_LIABILITIES: 33200, TOTAL_EQUITY: 12000, TOTAL_DEBT: 10200, OPERATING_CASH_FLOW: 480 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-22", v: { REVENUE: 980, COGS: 580, NET_PROFIT: 120, TOTAL_ASSETS: 41800, TOTAL_LIABILITIES: 31200, TOTAL_EQUITY: 10600, TOTAL_DEBT: 11600, OPERATING_CASH_FLOW: -40 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-21", v: { REVENUE: 1050, COGS: 620, NET_PROFIT: 135, TOTAL_ASSETS: 42200, TOTAL_LIABILITIES: 31400, TOTAL_EQUITY: 10800, TOTAL_DEBT: 11500, OPERATING_CASH_FLOW: 30 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-21", v: { REVENUE: 1120, COGS: 660, NET_PROFIT: 150, TOTAL_ASSETS: 44000, TOTAL_LIABILITIES: 32400, TOTAL_EQUITY: 11600, TOTAL_DEBT: 11000, OPERATING_CASH_FLOW: 120 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-20", v: { REVENUE: 1210, COGS: 710, NET_PROFIT: 168, TOTAL_ASSETS: 44800, TOTAL_LIABILITIES: 32900, TOTAL_EQUITY: 11900, TOTAL_DEBT: 10800, OPERATING_CASH_FLOW: 210 } },
      ],
      dividends: [
        { announcementDate: "2025-11-05", dividendPerShare: 0.35, status: "ANNOUNCED", dividendType: "CASH", notes: "Eligibility and distribution dates not officially announced yet" },
      ],
    },
    {
      ticker: "MTXT",
      nameEn: "Demo Misr Textiles",
      nameAr: "منسوجات مصر التجريبية",
      sector: "Industrial",
      industry: "Textiles & Apparel",
      shares: 1200,
      descriptionEn: "Demo industrial manufacturer reporting in EGP thousands; notable debt reduction.",
      descriptionAr: "شركة صناعية تجريبية تقدم تقاريرها بآلاف الجنيهات؛ خفض ديون ملحوظ.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-03-28", v: { REVENUE: 850000, COGS: 610000, NET_PROFIT: 42000, TOTAL_ASSETS: 1200000, TOTAL_LIABILITIES: 780000, TOTAL_EQUITY: 420000, TOTAL_DEBT: 300000, OPERATING_CASH_FLOW: 55000 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-03-26", v: { REVENUE: 910000, COGS: 655000, NET_PROFIT: 48000, TOTAL_ASSETS: 1250000, TOTAL_LIABILITIES: 800000, TOTAL_EQUITY: 450000, TOTAL_DEBT: 320000, OPERATING_CASH_FLOW: 60000 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-25", v: { REVENUE: 1030000, COGS: 720000, NET_PROFIT: 60000, TOTAL_ASSETS: 1300000, TOTAL_LIABILITIES: 795000, TOTAL_EQUITY: 505000, TOTAL_DEBT: 275000, OPERATING_CASH_FLOW: 72000 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-23", v: { REVENUE: 240000, COGS: 170000, NET_PROFIT: 13000, TOTAL_ASSETS: 1265000, TOTAL_LIABILITIES: 807000, TOTAL_EQUITY: 458000, TOTAL_DEBT: 315000, OPERATING_CASH_FLOW: 15000 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-22", v: { REVENUE: 255000, COGS: 180000, NET_PROFIT: 14000, TOTAL_ASSETS: 1270000, TOTAL_LIABILITIES: 808000, TOTAL_EQUITY: 462000, TOTAL_DEBT: 310000, OPERATING_CASH_FLOW: 16000 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-22", v: { REVENUE: 262000, COGS: 183000, NET_PROFIT: 15500, TOTAL_ASSETS: 1280000, TOTAL_LIABILITIES: 802000, TOTAL_EQUITY: 478000, TOTAL_DEBT: 295000, OPERATING_CASH_FLOW: 17000 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-21", v: { REVENUE: 275000, COGS: 190000, NET_PROFIT: 16500, TOTAL_ASSETS: 1285000, TOTAL_LIABILITIES: 799000, TOTAL_EQUITY: 486000, TOTAL_DEBT: 285000, OPERATING_CASH_FLOW: 18000 } },
      ],
      dividends: [],
    },
    {
      ticker: "NTEL",
      nameEn: "Demo Nile Telecom",
      nameAr: "نيل تيليكوم التجريبية",
      sector: "Telecom",
      industry: "Telecommunications",
      shares: 1900,
      descriptionEn: "Demo telecom operator with accelerating profit growth and strong revenue growth.",
      descriptionAr: "شركة اتصالات تجريبية بتسارع نمو الأرباح ونمو قوي للإيرادات.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-03-15", v: { REVENUE: 12000, COGS: 5000, NET_PROFIT: 1800, TOTAL_ASSETS: 32000, TOTAL_LIABILITIES: 18000, TOTAL_EQUITY: 14000, TOTAL_DEBT: 6000, OPERATING_CASH_FLOW: 3600 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-03-14", v: { REVENUE: 14100, COGS: 5800, NET_PROFIT: 2350, TOTAL_ASSETS: 34500, TOTAL_LIABILITIES: 19000, TOTAL_EQUITY: 15500, TOTAL_DEBT: 5600, OPERATING_CASH_FLOW: 4100 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-13", v: { REVENUE: 17200, COGS: 6900, NET_PROFIT: 3480, TOTAL_ASSETS: 37000, TOTAL_LIABILITIES: 19200, TOTAL_EQUITY: 17800, TOTAL_DEBT: 4900, OPERATING_CASH_FLOW: 5300 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-16", v: { REVENUE: 3300, COGS: 1350, NET_PROFIT: 800, TOTAL_ASSETS: 35000, TOTAL_LIABILITIES: 19100, TOTAL_EQUITY: 15900, TOTAL_DEBT: 5400, OPERATING_CASH_FLOW: 1100 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-15", v: { REVENUE: 3500, COGS: 1430, NET_PROFIT: 870, TOTAL_ASSETS: 35400, TOTAL_LIABILITIES: 19300, TOTAL_EQUITY: 16100, TOTAL_DEBT: 5300, OPERATING_CASH_FLOW: 1200 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-15", v: { REVENUE: 4100, COGS: 1650, NET_PROFIT: 1020, TOTAL_ASSETS: 36200, TOTAL_LIABILITIES: 19400, TOTAL_EQUITY: 16800, TOTAL_DEBT: 5100, OPERATING_CASH_FLOW: 1350 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-14", v: { REVENUE: 4400, COGS: 1750, NET_PROFIT: 1150, TOTAL_ASSETS: 36600, TOTAL_LIABILITIES: 19500, TOTAL_EQUITY: 17100, TOTAL_DEBT: 5000, OPERATING_CASH_FLOW: 1450 } },
      ],
      dividends: [
        { announcementDate: "2025-05-15", eligibilityDate: "2025-06-02", exDividendDate: "2025-06-04", distributionDate: "2025-05-20", dividendPerShare: 0.6, status: "PAID", dividendType: "CASH" },
        { announcementDate: "2025-10-25", eligibilityDate: "2025-12-05", exDividendDate: "2025-12-08", dividendPerShare: 0.7, status: "ELIGIBLE", dividendType: "CASH", notes: "Distribution date to be confirmed by the company" },
      ],
    },
    {
      ticker: "SPHA",
      nameEn: "Demo Shifa Pharma",
      nameAr: "شفاء للأدوية (تجريبي)",
      sector: "Healthcare",
      industry: "Pharmaceuticals",
      shares: 340,
      descriptionEn: "Steady demo pharmaceutical company; ROE below the strong-profitability threshold.",
      descriptionAr: "شركة أدوية تجريبية مستقرة؛ عائدها على حقوق الملكية أقل من حد الربحية القوية.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-04-10", v: { REVENUE: 1850, COGS: 920, NET_PROFIT: 240, TOTAL_ASSETS: 2900, TOTAL_LIABILITIES: 1300, TOTAL_EQUITY: 1600, TOTAL_DEBT: 400, OPERATING_CASH_FLOW: 310 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-04-08", v: { REVENUE: 2080, COGS: 1010, NET_PROFIT: 275, TOTAL_ASSETS: 3150, TOTAL_LIABILITIES: 1400, TOTAL_EQUITY: 1750, TOTAL_DEBT: 380, OPERATING_CASH_FLOW: 340 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-04-07", v: { REVENUE: 2350, COGS: 1130, NET_PROFIT: 320, TOTAL_ASSETS: 3400, TOTAL_LIABILITIES: 1100, TOTAL_EQUITY: 2300, TOTAL_DEBT: 360, OPERATING_CASH_FLOW: 385 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-28", v: { REVENUE: 520, COGS: 260, NET_PROFIT: 68, TOTAL_ASSETS: 3200, TOTAL_LIABILITIES: 1420, TOTAL_EQUITY: 1780, TOTAL_DEBT: 390, OPERATING_CASH_FLOW: 85 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-27", v: { REVENUE: 545, COGS: 270, NET_PROFIT: 71, TOTAL_ASSETS: 3240, TOTAL_LIABILITIES: 1440, TOTAL_EQUITY: 1800, TOTAL_DEBT: 385, OPERATING_CASH_FLOW: 90 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-27", v: { REVENUE: 600, COGS: 295, NET_PROFIT: 80, TOTAL_ASSETS: 3320, TOTAL_LIABILITIES: 1220, TOTAL_EQUITY: 2100, TOTAL_DEBT: 375, OPERATING_CASH_FLOW: 95 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-26", v: { REVENUE: 625, COGS: 306, NET_PROFIT: 84, TOTAL_ASSETS: 3360, TOTAL_LIABILITIES: 1240, TOTAL_EQUITY: 2120, TOTAL_DEBT: 370, OPERATING_CASH_FLOW: 100 } },
      ],
      dividends: [
        { announcementDate: "2024-06-20", eligibilityDate: "2024-07-05", exDividendDate: "2024-07-08", distributionDate: "2024-07-10", dividendPerShare: 0.5, status: "PAID", dividendType: "CASH" },
        { announcementDate: "2025-02-01", dividendType: "CASH", status: "CANCELLED", notes: "Cancelled by AGM resolution; profits retained for expansion" },
      ],
    },
    {
      ticker: "GFOOD",
      nameEn: "Demo Green Foods",
      nameAr: "الأغذية الخضراء التجريبية",
      sector: "Food",
      industry: "Food Production",
      shares: 620,
      descriptionEn: "Demo food producer with strong profit growth and improving margins.",
      descriptionAr: "شركة أغذية تجريبية بنمو أرباح قوي وهوامش متحسنة.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-03-25", v: { REVENUE: 5400, COGS: 3900, NET_PROFIT: 310, TOTAL_ASSETS: 6800, TOTAL_LIABILITIES: 3900, TOTAL_EQUITY: 2900, TOTAL_DEBT: 1400, OPERATING_CASH_FLOW: 420 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-03-24", v: { REVENUE: 6100, COGS: 4400, NET_PROFIT: 350, TOTAL_ASSETS: 7200, TOTAL_LIABILITIES: 4150, TOTAL_EQUITY: 3050, TOTAL_DEBT: 1350, OPERATING_CASH_FLOW: 460 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-23", v: { REVENUE: 7200, COGS: 4900, NET_PROFIT: 462, TOTAL_ASSETS: 7600, TOTAL_LIABILITIES: 4300, TOTAL_EQUITY: 3300, TOTAL_DEBT: 1200, OPERATING_CASH_FLOW: 540 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-26", v: { REVENUE: 1450, COGS: 1050, NET_PROFIT: 82, TOTAL_ASSETS: 7300, TOTAL_LIABILITIES: 4210, TOTAL_EQUITY: 3090, TOTAL_DEBT: 1340, OPERATING_CASH_FLOW: 130 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-25", v: { REVENUE: 1530, COGS: 1100, NET_PROFIT: 88, TOTAL_ASSETS: 7400, TOTAL_LIABILITIES: 4270, TOTAL_EQUITY: 3130, TOTAL_DEBT: 1330, OPERATING_CASH_FLOW: 140 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-25", v: { REVENUE: 1700, COGS: 1180, NET_PROFIT: 108, TOTAL_ASSETS: 7500, TOTAL_LIABILITIES: 4290, TOTAL_EQUITY: 3210, TOTAL_DEBT: 1280, OPERATING_CASH_FLOW: 155 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-24", v: { REVENUE: 1800, COGS: 1240, NET_PROFIT: 116, TOTAL_ASSETS: 7550, TOTAL_LIABILITIES: 4300, TOTAL_EQUITY: 3250, TOTAL_DEBT: 1260, OPERATING_CASH_FLOW: 165 } },
      ],
      dividends: [
        { announcementDate: "2025-05-30", eligibilityDate: "2025-06-14", exDividendDate: "2025-06-16", distributionDate: "2025-06-15", dividendPerShare: 0.8, status: "PAID", dividendType: "CASH" },
      ],
    },
    {
      ticker: "ALFA",
      nameEn: "Demo Alfa Holding",
      nameAr: "ألفا القابضة التجريبية",
      sector: "Investment",
      industry: "Diversified Holding",
      shares: 480,
      descriptionEn: "Demo holding company that recovered from losses to profit with positive cash flow and lower debt.",
      descriptionAr: "شركة قابضة تجريبية تعافت من الخسارة إلى الربح مع تدفق نقدي إيجابي وانخفاض الدين.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-04-15", v: { REVENUE: 2100, COGS: 1200, NET_PROFIT: -80, TOTAL_ASSETS: 9500, TOTAL_LIABILITIES: 5200, TOTAL_EQUITY: 4300, TOTAL_DEBT: 2600, OPERATING_CASH_FLOW: -150 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-04-13", v: { REVENUE: 2300, COGS: 1350, NET_PROFIT: -60, TOTAL_ASSETS: 9800, TOTAL_LIABILITIES: 5600, TOTAL_EQUITY: 4200, TOTAL_DEBT: 2700, OPERATING_CASH_FLOW: -40 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-04-12", v: { REVENUE: 2580, COGS: 1420, NET_PROFIT: 95, TOTAL_ASSETS: 10100, TOTAL_LIABILITIES: 5700, TOTAL_EQUITY: 4400, TOTAL_DEBT: 2480, OPERATING_CASH_FLOW: 210 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-06-02", v: { REVENUE: 560, COGS: 330, NET_PROFIT: -20, TOTAL_ASSETS: 9900, TOTAL_LIABILITIES: 5650, TOTAL_EQUITY: 4250, TOTAL_DEBT: 2720, OPERATING_CASH_FLOW: -20 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-09-01", v: { REVENUE: 590, COGS: 345, NET_PROFIT: -15, TOTAL_ASSETS: 9950, TOTAL_LIABILITIES: 5670, TOTAL_EQUITY: 4280, TOTAL_DEBT: 2710, OPERATING_CASH_FLOW: -10 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-06-01", v: { REVENUE: 630, COGS: 365, NET_PROFIT: 25, TOTAL_ASSETS: 10050, TOTAL_LIABILITIES: 5720, TOTAL_EQUITY: 4330, TOTAL_DEBT: 2540, OPERATING_CASH_FLOW: 60 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-09-01", v: { REVENUE: 655, COGS: 378, NET_PROFIT: 30, TOTAL_ASSETS: 10100, TOTAL_LIABILITIES: 5730, TOTAL_EQUITY: 4370, TOTAL_DEBT: 2500, OPERATING_CASH_FLOW: 80 } },
      ],
      dividends: [],
    },
    {
      ticker: "SIGF",
      nameEn: "Demo Sigma Finance",
      nameAr: "سيجما للخدمات المالية (تجريبية)",
      sector: "Financial Services",
      industry: "Non-bank Financial Services",
      shares: 210,
      descriptionEn: "Stable low-growth demo financial services company (baseline non-matcher).",
      descriptionAr: "شركة خدمات مالية تجريبية مستقرة منخفضة النمو (عنصر أساس غير مطابق).",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-04-20", v: { REVENUE: 950, COGS: 380, NET_PROFIT: 180, TOTAL_ASSETS: 4200, TOTAL_LIABILITIES: 2400, TOTAL_EQUITY: 1800, TOTAL_DEBT: 900, OPERATING_CASH_FLOW: 190 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-04-18", v: { REVENUE: 1020, COGS: 410, NET_PROFIT: 195, TOTAL_ASSETS: 4500, TOTAL_LIABILITIES: 2600, TOTAL_EQUITY: 1900, TOTAL_DEBT: 950, OPERATING_CASH_FLOW: 200 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-04-17", v: { REVENUE: 1090, COGS: 435, NET_PROFIT: 208, TOTAL_ASSETS: 4800, TOTAL_LIABILITIES: 2800, TOTAL_EQUITY: 2000, TOTAL_DEBT: 990, OPERATING_CASH_FLOW: 215 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-06-05", v: { REVENUE: 250, COGS: 100, NET_PROFIT: 48, TOTAL_ASSETS: 4600, TOTAL_LIABILITIES: 2650, TOTAL_EQUITY: 1950, TOTAL_DEBT: 960, OPERATING_CASH_FLOW: 50 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-09-04", v: { REVENUE: 262, COGS: 105, NET_PROFIT: 50, TOTAL_ASSETS: 4650, TOTAL_LIABILITIES: 2680, TOTAL_EQUITY: 1970, TOTAL_DEBT: 965, OPERATING_CASH_FLOW: 52 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-06-04", v: { REVENUE: 272, COGS: 108, NET_PROFIT: 52, TOTAL_ASSETS: 4720, TOTAL_LIABILITIES: 2730, TOTAL_EQUITY: 1990, TOTAL_DEBT: 975, OPERATING_CASH_FLOW: 54 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-09-04", v: { REVENUE: 280, COGS: 110, NET_PROFIT: 54, TOTAL_ASSETS: 4760, TOTAL_LIABILITIES: 2760, TOTAL_EQUITY: 2000, TOTAL_DEBT: 980, OPERATING_CASH_FLOW: 56 } },
      ],
      dividends: [
        { announcementDate: "2024-05-10", eligibilityDate: "2024-05-25", exDividendDate: "2024-05-27", distributionDate: "2024-06-10", dividendPerShare: 0.4, status: "EXPIRED", dividendType: "CASH" },
      ],
    },
    {
      ticker: "ORET",
      nameEn: "Demo Orion Retail",
      nameAr: "أوريون للتجزئة التجريبية",
      sector: "Consumer",
      industry: "Retail",
      shares: 520,
      descriptionEn: "Demo retailer that turned from loss to profit with positive cash flow and lower debt.",
      descriptionAr: "شركة تجزئة تجريبية تحولت من الخسارة إلى الربح مع تدفق نقدي إيجابي وانخفاض الدين.",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-04-25", v: { REVENUE: 3400, COGS: 2700, NET_PROFIT: 150, TOTAL_ASSETS: 5200, TOTAL_LIABILITIES: 3600, TOTAL_EQUITY: 1600, TOTAL_DEBT: 1900, OPERATING_CASH_FLOW: 120 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-04-23", v: { REVENUE: 3150, COGS: 2500, NET_PROFIT: -45, TOTAL_ASSETS: 5000, TOTAL_LIABILITIES: 3480, TOTAL_EQUITY: 1520, TOTAL_DEBT: 2100, OPERATING_CASH_FLOW: -90 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-04-22", v: { REVENUE: 3520, COGS: 2790, NET_PROFIT: 58, TOTAL_ASSETS: 5150, TOTAL_LIABILITIES: 3540, TOTAL_EQUITY: 1610, TOTAL_DEBT: 1880, OPERATING_CASH_FLOW: 140 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-30", v: { REVENUE: 810, COGS: 640, NET_PROFIT: -15, TOTAL_ASSETS: 5050, TOTAL_LIABILITIES: 3505, TOTAL_EQUITY: 1545, TOTAL_DEBT: 2080, OPERATING_CASH_FLOW: -10 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-29", v: { REVENUE: 840, COGS: 660, NET_PROFIT: -10, TOTAL_ASSETS: 5080, TOTAL_LIABILITIES: 3520, TOTAL_EQUITY: 1560, TOTAL_DEBT: 2060, OPERATING_CASH_FLOW: 10 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-29", v: { REVENUE: 890, COGS: 700, NET_PROFIT: 18, TOTAL_ASSETS: 5100, TOTAL_LIABILITIES: 3510, TOTAL_EQUITY: 1590, TOTAL_DEBT: 1950, OPERATING_CASH_FLOW: 40 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-28", v: { REVENUE: 920, COGS: 720, NET_PROFIT: 22, TOTAL_ASSETS: 5130, TOTAL_LIABILITIES: 3530, TOTAL_EQUITY: 1600, TOTAL_DEBT: 1920, OPERATING_CASH_FLOW: 60 } },
      ],
      dividends: [],
    },
    {
      ticker: "FSTL",
      nameEn: "Demo Falcon Steels",
      nameAr: "الصقر للحديد التجريبية",
      sector: "Industrial",
      industry: "Steel & Metals",
      shares: 950,
      descriptionEn: "Demo steel producer showing a financial deterioration pattern (profit to loss).",
      descriptionAr: "شركة حديد تجريبية تُظهر نمط تدهور مالي (تحول من ربح إلى خسارة).",
      annual: [
        { label: "FY 2022", year: 2022, start: "2022-01-01", end: "2022-12-31", pub: "2023-03-30", v: { REVENUE: 8800, COGS: 7200, NET_PROFIT: 620, TOTAL_ASSETS: 11000, TOTAL_LIABILITIES: 6300, TOTAL_EQUITY: 4700, TOTAL_DEBT: 3600, OPERATING_CASH_FLOW: 580 } },
        { label: "FY 2023", year: 2023, start: "2023-01-01", end: "2023-12-31", pub: "2024-03-29", v: { REVENUE: 8200, COGS: 6800, NET_PROFIT: 90, TOTAL_ASSETS: 10800, TOTAL_LIABILITIES: 6300, TOTAL_EQUITY: 4500, TOTAL_DEBT: 3900, OPERATING_CASH_FLOW: 150 } },
        { label: "FY 2024", year: 2024, start: "2024-01-01", end: "2024-12-31", pub: "2025-03-28", v: { REVENUE: 6970, COGS: 6100, NET_PROFIT: -130, TOTAL_ASSETS: 10500, TOTAL_LIABILITIES: 6250, TOTAL_EQUITY: 4250, TOTAL_DEBT: 4100, OPERATING_CASH_FLOW: -210 } },
      ],
      quarterly: [
        { label: "Q1 2024", year: 2024, start: "2024-01-01", end: "2024-03-31", pub: "2024-05-31", v: { REVENUE: 2100, COGS: 1720, NET_PROFIT: 30, TOTAL_ASSETS: 10700, TOTAL_LIABILITIES: 6250, TOTAL_EQUITY: 4450, TOTAL_DEBT: 3950, OPERATING_CASH_FLOW: -50 } },
        { label: "Q2 2024", year: 2024, start: "2024-04-01", end: "2024-06-30", pub: "2024-08-30", v: { REVENUE: 2050, COGS: 1690, NET_PROFIT: 20, TOTAL_ASSETS: 10650, TOTAL_LIABILITIES: 6220, TOTAL_EQUITY: 4430, TOTAL_DEBT: 3980, OPERATING_CASH_FLOW: -30 } },
        { label: "Q1 2025", year: 2025, start: "2025-01-01", end: "2025-03-31", pub: "2025-05-30", v: { REVENUE: 1800, COGS: 1520, NET_PROFIT: -35, TOTAL_ASSETS: 10600, TOTAL_LIABILITIES: 6250, TOTAL_EQUITY: 4350, TOTAL_DEBT: 4050, OPERATING_CASH_FLOW: -90 } },
        { label: "Q2 2025", year: 2025, start: "2025-04-01", end: "2025-06-30", pub: "2025-08-29", v: { REVENUE: 1750, COGS: 1490, NET_PROFIT: -45, TOTAL_ASSETS: 10550, TOTAL_LIABILITIES: 6270, TOTAL_EQUITY: 4280, TOTAL_DEBT: 4080, OPERATING_CASH_FLOW: -110 } },
      ],
      dividends: [],
    },
  ])

  const SOURCE = "Synthetic demo dataset — not real EGX filings (DEMO DATA)"

  for (const c of companies) {
    const company = await db.company.create({
      data: {
        ticker: c.ticker,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        industry: c.industry,
        sharesOutstanding: c.shares * 1e6,
        isDemoData: true,
        descriptionEn: c.descriptionEn,
        descriptionAr: c.descriptionAr,
        website: null,
      },
    })

    const allPeriods = [...c.annual, ...c.quarterly]
    for (const p of allPeriods) {
      const isAnnual = p.label.startsWith("FY")
      const values = deriveGrossProfit(p.v)
      const report = await db.financialReport.create({
        data: {
          companyId: company.id,
          reportType: isAnnual ? "ANNUAL" : "INTERIM",
          periodType: isAnnual ? "ANNUAL" : "QUARTERLY",
          fiscalYear: p.year,
          periodLabel: p.label,
          periodStart: new Date(p.start),
          periodEnd: new Date(p.end),
          publicationDate: new Date(p.pub),
          sourceName: SOURCE,
          processingStatus: "VALIDATED",
          extractionMethod: "SEED_DEMO",
          isDemoData: true,
        },
      })
      for (const [code, rawValue] of Object.entries(values)) {
        const metric = RAW_METRICS.find((m) => m.code === code)
        if (!metric) continue
        // MTXT reports in EGP thousands — demonstrates unit normalization
        const unit = c.ticker === "MTXT" ? "THOUSAND" : "MILLION"
        await db.financialValue.create({
          data: {
            companyId: company.id,
            reportId: report.id,
            metricCode: code,
            originalLabel: metric.labelEn,
            value: rawValue,
            unit,
            normalizedValue: normalizeToEgp(rawValue, unit),
            statementType: metric.statementType,
            extractionMethod: "SEED_DEMO",
            confidence: 1,
            validationStatus: "VALID",
            isDemoData: true,
          },
        })
      }
    }

    for (const d of c.dividends) {
      await db.dividend.create({
        data: {
          companyId: company.id,
          announcementDate: d.announcementDate ? new Date(d.announcementDate) : null,
          eligibilityDate: d.eligibilityDate ? new Date(d.eligibilityDate) : null,
          exDividendDate: d.exDividendDate ? new Date(d.exDividendDate) : null,
          distributionDate: d.distributionDate ? new Date(d.distributionDate) : null,
          dividendPerShare: d.dividendPerShare ?? null,
          dividendType: d.dividendType ?? "CASH",
          status: d.status,
          sourceName: SOURCE,
          isDemoData: true,
          notes: d.notes ?? null,
        },
      })
    }
    console.log(`  ✓ ${c.ticker} — ${c.nameEn} (${allPeriods.length} reports)`)
  }

  // Preset scanner rules
  const presets: { presetKey: string; name: string; nameAr: string; description: string; conditions: unknown }[] = [
    { presetKey: "TURNAROUND", name: "Financial Turnaround", nameAr: "تحول مالي (خسارة إلى ربح)", description: "Companies that moved from net loss to net profit (same-period basis).", conditions: [{ kind: "event", eventType: "LOSS_TO_PROFIT" }] },
    { presetKey: "DETERIORATION", name: "Profit → Loss Deterioration", nameAr: "تدهور مالي (ربح إلى خسارة)", description: "Companies that moved from net profit to net loss.", conditions: [{ kind: "event", eventType: "PROFIT_TO_LOSS" }] },
    { presetKey: "PROFIT_GROWTH", name: "Profit Growth ≥ 30%", nameAr: "نمو أرباح 30% أو أكثر", description: "Net profit growth of 30% or more year-over-year.", conditions: [{ kind: "metric", code: "profit_growth", operator: ">=", value: 30 }] },
    { presetKey: "REVENUE_GROWTH", name: "Revenue Growth ≥ 15%", nameAr: "نمو إيرادات 15% أو أكثر", description: "Revenue growth of 15% or more year-over-year.", conditions: [{ kind: "metric", code: "revenue_growth", operator: ">=", value: 15 }] },
    { presetKey: "DEBT_REDUCTION", name: "Debt Reduction ≥ 5%", nameAr: "خفض ديون 5% أو أكثر", description: "Total debt decreased by 5% or more.", conditions: [{ kind: "metric", code: "debt_growth", operator: "<=", value: -5 }] },
    { presetKey: "EQUITY_GROWTH", name: "Equity Growth ≥ 10%", nameAr: "نمو حقوق ملكية 10% أو أكثر", description: "Shareholders' equity increased by 10% or more.", conditions: [{ kind: "metric", code: "equity_growth", operator: ">=", value: 10 }] },
    { presetKey: "STRONG_CASH_FLOW", name: "Positive Operating Cash Flow", nameAr: "تدفق نقدي تشغيلي إيجابي", description: "Operating cash flow is greater than zero.", conditions: [{ kind: "metric", code: "operating_cash_flow", operator: ">", value: 0 }] },
    {
      presetKey: "FINANCIAL_RECOVERY", name: "Financial Recovery Pattern", nameAr: "نمط التعافي المالي",
      description: "Loss→Profit AND revenue growth ≥ 10% AND positive operating cash flow AND debt not increasing.",
      conditions: [
        { kind: "event", eventType: "LOSS_TO_PROFIT" },
        { kind: "metric", code: "revenue_growth", operator: ">=", value: 10 },
        { kind: "metric", code: "operating_cash_flow", operator: ">", value: 0 },
        { kind: "metric", code: "debt_growth", operator: "<=", value: 0 },
      ],
    },
    { presetKey: "STRONG_ROE", name: "Strong Profitability (ROE ≥ 15%)", nameAr: "ربحية قوية (عائد 15% أو أكثر)", description: "Return on equity of 15% or more.", conditions: [{ kind: "metric", code: "roe", operator: ">=", value: 15 }] },
    { presetKey: "HIGH_ASSETS", name: "High Total Assets (≥ EGP 10B)", nameAr: "أصول كبيرة (10 مليار جنيه أو أكثر)", description: "Total assets of EGP 10 billion or more.", conditions: [{ kind: "metric", code: "total_assets", operator: ">=", value: 10e9 }] },
    { presetKey: "PROFIT_ACCELERATION", name: "Accelerating Profit Growth", nameAr: "تسارع نمو الأرباح", description: "Profit growth is positive and increasing for two consecutive periods.", conditions: [{ kind: "event", eventType: "PROFIT_ACCELERATION" }] },
    { presetKey: "DIVIDEND_CALENDAR", name: "Dividend Calendar (Announced / Upcoming)", nameAr: "تقويم التوزيعات (معلنة / قادمة)", description: "Companies with announced, upcoming or eligible dividends.", conditions: [{ kind: "dividend", statuses: ["ANNOUNCED", "UPCOMING", "ELIGIBLE"] }] },
  ]

  for (const p of presets) {
    await db.scannerRule.create({
      data: {
        name: p.name,
        nameAr: p.nameAr,
        description: p.description,
        isPreset: true,
        presetKey: p.presetKey,
        conditions: JSON.stringify(p.conditions),
        createdBy: "system",
      },
    })
  }
  console.log(`  ✓ ${presets.length} preset scanner rules`)

  // Calculate metrics + detect events
  console.log("Recomputing calculated metrics & detecting events...")
  const results = await recomputeAll()
  for (const r of results) {
    console.log(`  ✓ ${r.companyId}: ${r.calculatedMetrics} metrics, ${r.events.length} events`)
  }

  await db.auditLog.create({
    data: {
      actor: "system",
      action: "SEED",
      entityType: "Database",
      details: `Seeded ${companies.length} demo companies, ${results.length} recomputes, ${presets.length} preset scanner rules. All data is synthetic and flagged DEMO.`,
    },
  })

  console.log("Seed complete (DEMO DATA — not real EGX filings).")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
