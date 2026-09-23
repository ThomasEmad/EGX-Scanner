// Seed — REAL EGX company registry + metric definitions + preset scanner rules.
//
// IMPORTANT (spec: no demo data): this seed does NOT create any financial values,
// reports, events or dividends. It only creates:
//   1. The real EGX listed-company registry (public factual metadata: ticker, name, sector)
//   2. The canonical metric definitions (normalization dictionary, EN + AR aliases)
//   3. The preset scanner rules
//   4. The manual-upload data source
// All financial data must arrive through the admin upload pipeline (real PDFs).

import { PrismaClient } from "@prisma/client"
import { RAW_METRICS, CALC_METRICS } from "../src/lib/financial/registry"

const db = new PrismaClient()

// ---------------------------------------------------------------------------
// Real EGX listed companies (public registry metadata — no financial figures).
// ISIN left blank unless verified; admin can enrich later.
// Ticker = official EGX ticker code (e.g. COMI.CA on EGX → "COMI" here).
// ---------------------------------------------------------------------------
const EGX_COMPANIES: {
  ticker: string
  nameEn: string
  nameAr: string
  sector: string
  industry?: string
  descriptionEn: string
}[] = [
  // Banks
  { ticker: "COMI", nameEn: "Commercial International Bank (Egypt)", nameAr: "البنك التجاري الدولي (إيجيبت)", sector: "Banks", industry: "Banking", descriptionEn: "Egypt's largest private-sector bank, listed on EGX (and formerly MSCI EM index heavyweight)." },
  { ticker: "QNBA", nameEn: "QNB Al Ahli", nameAr: "كيو إن بي الأهلي", sector: "Banks", industry: "Banking", descriptionEn: "Qatar National Bank Al Ahli — Egyptian subsidiary of QNB Group." },
  { ticker: "ADIB", nameEn: "Abu Dhabi Islamic Bank (Egypt)", nameAr: "بنك أبوظبي الإسلامي المصري", sector: "Banks", industry: "Islamic Banking", descriptionEn: "Islamic bank operating in Egypt, subsidiary of Abu Dhabi Islamic Bank PJSC." },
  // Telecom
  { ticker: "ETEL", nameEn: "Telecom Egypt", nameAr: "المصرية للاتصالات", sector: "Telecom", industry: "Telecommunications", descriptionEn: "Egypt's integrated telecom operator (fixed, mobile via WE, submarine cables)." },
  { ticker: "VODE", nameEn: "Vodafone Egypt Telecom", nameAr: "فودافون مصر", sector: "Telecom", industry: "Mobile Telecommunications", descriptionEn: "Egypt's largest mobile network operator, listed on EGX in 2022." },
  // Real Estate
  { ticker: "TMGH", nameEn: "Talaat Moustafa Group Holding", nameAr: "جروب طلعت مصطفى القابضة", sector: "Real Estate", industry: "Real Estate Development", descriptionEn: "Large-scale real-estate developer (Madinty, Rehab, Noor, Banan) with hospitality arm." },
  { ticker: "PHDC", nameEn: "Palm Hills Developments", nameAr: "بالم هيلز للتطوير العقاري", sector: "Real Estate", industry: "Real Estate Development", descriptionEn: "Developer of second homes and residential communities (Badya, Hacienda)." },
  { ticker: "MNHD", nameEn: "Madinet Masr for Housing & Development", nameAr: "مدينة مصر للإسكان والتعمير", sector: "Real Estate", industry: "Real Estate Development", descriptionEn: "Nasr City-based developer (Taj City, Sarai) with a large land bank." },
  { ticker: "AMER", nameEn: "Amer Group", nameAr: "جروب عامر", sector: "Real Estate", industry: "Real Estate & Leisure", descriptionEn: "Developer of Porto-branded resorts and mixed-use destinations." },
  { ticker: "ORHD", nameEn: "Orascom Development Holding", nameAr: "أوراسكوم للتطوير العمراني", sector: "Real Estate", industry: "Integrated Town Development", descriptionEn: "Developer of integrated towns (El Gouna, Makadi, Taba Heights)." },
  // Industrial
  { ticker: "SWDY", nameEn: "Elsewedy Electric", nameAr: "السويدي إلكتريك", sector: "Industrial", industry: "Electrical Equipment & Cables", descriptionEn: "Cables, electrical products and turnkey infrastructure solutions across MENA and Africa." },
  { ticker: "ORWE", nameEn: "Orascom Construction", nameAr: "أوراسكوم للإنشاءات والصناعة", sector: "Industrial", industry: "Construction & Engineering", descriptionEn: "Engineering, procurement and construction contractor (EGX and Nasdaq Dubai listed)." },
  { ticker: "ABUK", nameEn: "Abu Qir Fertilizers & Chemical Industries", nameAr: "أبو قير للأسمدة والصناعات الكيميائية", sector: "Industrial", industry: "Fertilizers & Chemicals", descriptionEn: "Nitrogen fertilizer producer with strong export exposure." },
  { ticker: "SKPC", nameEn: "Sidi Kerir Petrochemicals (SIDPEC)", nameAr: "سيدى كرير للبتروكيماويات", sector: "Industrial", industry: "Petrochemicals", descriptionEn: "Producer of polyethylene and butane-gas-based petrochemicals." },
  { ticker: "AMOC", nameEn: "Alexandria Mineral Oils Company", nameAr: "الإسكندرية للزيوت المعدنية", sector: "Industrial", industry: "Oil Refining", descriptionEn: "Refines lube-oil base stocks and paraffin products." },
  { ticker: "ECSC", nameEn: "Egyptian Chemical Industries (Kima)", nameAr: "الصناعات الكيميائية المصرية (كيما)", sector: "Industrial", industry: "Chemicals & Fertilizers", descriptionEn: "Aswan-based producer of nitrogen fertilizers and chemicals." },
  { ticker: "EGAL", nameEn: "Al Ezz Al Dekheila Steel", nameAr: "الإز الدخيلة للصلب", sector: "Industrial", industry: "Steel", descriptionEn: "Reinforcing-steel producer." },
  { ticker: "MOPCO", nameEn: "Misr Fertilizers Production (MOPCO)", nameAr: "مصر لإنتاج الأسمدة", sector: "Industrial", industry: "Fertilizers", descriptionEn: "Producer of urea and ammonia (Damietta)." },
  // Food
  { ticker: "JUFO", nameEn: "Juhayna Food Industries", nameAr: "جهينة للصناعات الغذائية", sector: "Food", industry: "Dairy & Juices", descriptionEn: "Dairy and juice producer with an expanding retail arm." },
  { ticker: "DOMTY", nameEn: "Arabian Food Industries (Domty)", nameAr: "العربية للصناعات الغذائية (دومتي)", sector: "Food", industry: "Cheese & Juices", descriptionEn: "White-cheese market leader expanding into juices and bakery." },
  { ticker: "SUGR", nameEn: "Delta Sugar", nameAr: "الدلتا للسكر", sector: "Food", industry: "Sugar", descriptionEn: "Beet-sugar producer." },
  { ticker: "EFOOD", nameEn: "Egypt Foods Group", nameAr: "مصر للأغذية", sector: "Food", industry: "Snacks & Confectionery", descriptionEn: "Snacks, candy and pasta group (formerly International Company for Food Industries)." },
  // Healthcare
  { ticker: "CLHO", nameEn: "Cleopatra Hospitals", nameAr: "مستشفيات كليوباترا", sector: "Healthcare", industry: "Hospitals", descriptionEn: "Private hospital network in Greater Cairo." },
  { ticker: "AMPH", nameEn: "Amoun Pharmaceutical", nameAr: "أمون للأدوية", sector: "Healthcare", industry: "Pharmaceuticals", descriptionEn: "Pharmaceutical manufacturer (acquired by Baxter)." },
  { ticker: "ISPH", nameEn: "Egyptian International Pharmaceutical Industries (EIPICO)", nameAr: "المصرية الدولية للصناعات الدوائية", sector: "Healthcare", industry: "Pharmaceuticals", descriptionEn: "One of Egypt's largest generic-drug manufacturers (10th of Ramadan)." },
  { ticker: "RMDT", nameEn: "Rameda Pharmaceuticals", nameAr: "رميدا للأدوية", sector: "Healthcare", industry: "Pharmaceuticals", descriptionEn: "Fast-growing pharmaceutical producer (6th of October)." },
  // Consumer
  { ticker: "EAST", nameEn: "Eastern Company", nameAr: "الشرقية للدخان", sector: "Consumer", industry: "Tobacco", descriptionEn: "Tobacco products incumbent with investments in food and logistics." },
  { ticker: "CIRA", nameEn: "Cairo for Investment & Real Estate Development (CIRA)", nameAr: "القاهرة للاستثمار والتنمية العقارية", sector: "Consumer", industry: "Education Services", descriptionEn: "Education services group (international schools and universities)." },
  // Financial Services / Investment
  { ticker: "HRHO", nameEn: "EFG Holding", nameAr: "مجموعة إي إف جي القابضة", sector: "Financial Services", industry: "Investment Banking", descriptionEn: "Regional investment bank and diversified financial group (formerly EFG Hermes)." },
  { ticker: "PSFL", nameEn: "Pioneers Holding for Financial Investments", nameAr: "الرواد القابضة للاستثمارات المالية", sector: "Investment", industry: "Diversified Holding", descriptionEn: "Holding with brokerage, leasing, real-estate and food subsidiaries." },
  { ticker: "RAYA", nameEn: "Raya Holding for Financial Investments", nameAr: "راية القابضة للاستثمارات المالية", sector: "Investment", industry: "IT & BPO Services", descriptionEn: "IT, contact-center and trade conglomerate." },
]

async function main() {
  console.log("Seeding EGX registry (real companies, NO financial data)…")

  // 1. Metric definitions from the canonical registry
  let metricCount = 0
  for (const m of RAW_METRICS) {
    await db.metricDefinition.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        labelEn: m.labelEn,
        labelAr: m.labelAr,
        statementType: m.statementType,
        description: m.description ?? null,
        aliases: JSON.stringify(m.aliases),
        appliesToSectors: m.appliesToSectors ? JSON.stringify(m.appliesToSectors) : null,
        calcRole: "INPUT",
      },
      update: {
        labelEn: m.labelEn,
        labelAr: m.labelAr,
        statementType: m.statementType,
        description: m.description ?? null,
        aliases: JSON.stringify(m.aliases),
        appliesToSectors: m.appliesToSectors ? JSON.stringify(m.appliesToSectors) : null,
      },
    })
    metricCount++
  }
  for (const m of CALC_METRICS) {
    await db.metricDefinition.upsert({
      where: { code: m.code },
      create: {
        code: m.code,
        labelEn: m.labelEn,
        labelAr: m.labelAr,
        statementType: "OTHER",
        description: m.description ?? null,
        aliases: JSON.stringify([]),
        calcRole: "CALCULATED",
      },
      update: {
        labelEn: m.labelEn,
        labelAr: m.labelAr,
        description: m.description ?? null,
        calcRole: "CALCULATED",
      },
    })
    metricCount++
  }
  console.log(`  ✓ ${metricCount} metric definitions`)

  // 2. Real EGX companies — metadata only. isDemoData=false. No financial rows.
  for (const c of EGX_COMPANIES) {
    await db.company.upsert({
      where: { ticker: c.ticker },
      create: {
        ticker: c.ticker,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        industry: c.industry ?? null,
        descriptionEn: c.descriptionEn,
        isDemoData: false,
        listingStatus: "LISTED",
        isActive: true,
      },
      update: {
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        industry: c.industry ?? null,
        descriptionEn: c.descriptionEn,
        isDemoData: false,
      },
    })
  }
  console.log(`  ✓ ${EGX_COMPANIES.length} real EGX companies (metadata only)`)

  // 3. Preset scanner rules (recreated fresh — previous runs may reference demo data)
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
      description: "Loss→Profit transition with revenue growth ≥ 10%, positive operating cash flow and non-increasing debt.",
      conditions: [{ kind: "event", eventType: "FINANCIAL_RECOVERY" }],
    },
    { presetKey: "STRONG_ROE", name: "Strong Profitability (ROE ≥ 15%)", nameAr: "ربحية قوية (عائد 15% أو أكثر)", description: "Return on equity of 15% or more.", conditions: [{ kind: "metric", code: "roe", operator: ">=", value: 15 }] },
    { presetKey: "HIGH_ASSETS", name: "High Total Assets (≥ EGP 10B)", nameAr: "أصول كبيرة (10 مليار جنيه أو أكثر)", description: "Total assets of EGP 10 billion or more.", conditions: [{ kind: "metric", code: "total_assets", operator: ">=", value: 10e9 }] },
    { presetKey: "PROFIT_ACCELERATION", name: "Accelerating Profit Growth", nameAr: "تسارع نمو الأرباح", description: "Profit growth is positive and increasing for two consecutive periods.", conditions: [{ kind: "event", eventType: "PROFIT_ACCELERATION" }] },
    { presetKey: "DIVIDEND_CALENDAR", name: "Dividend Calendar (Announced / Upcoming)", nameAr: "تقويم التوزيعات (معلنة / قادمة)", description: "Companies with announced, upcoming or eligible dividends.", conditions: [{ kind: "dividend", statuses: ["ANNOUNCED", "UPCOMING", "ELIGIBLE"] }] },
    { presetKey: "VALUE_P_B", name: "Below Book Value (P/B ≤ 0.7)", nameAr: "تداول دون القيمة الدفترية", description: "Market price at or below 70% of book value per share — requires a market price point.", conditions: [{ kind: "metric", code: "p_b", operator: "<=", value: 0.7 }] },
    { presetKey: "DIVIDEND_YIELD", name: "Dividend Yield ≥ 5%", nameAr: "عائد توزيعات 5% أو أكثر", description: "Trailing-12-month dividend yield of 5% or more — requires a market price point.", conditions: [{ kind: "metric", code: "dividend_yield", operator: ">=", value: 5 }] },
  ]
  for (const p of presets) {
    await db.scannerRule.upsert({
      where: { presetKey: p.presetKey },
      create: {
        name: p.name,
        nameAr: p.nameAr,
        description: p.description,
        isPreset: true,
        presetKey: p.presetKey,
        conditions: JSON.stringify(p.conditions),
        createdBy: "system",
      },
      update: {
        name: p.name,
        nameAr: p.nameAr,
        description: p.description,
        conditions: JSON.stringify(p.conditions),
      },
    })
  }
  console.log(`  ✓ ${presets.length} preset scanner rules`)

  // 4. Data sources (manual upload is the v1 ingestion source)
  await db.dataSource.upsert({
    where: { name: "MANUAL_UPLOAD" },
    create: { name: "MANUAL_UPLOAD", kind: "MANUAL_UPLOAD", isActive: true, config: JSON.stringify({ description: "Admin-uploaded financial statement PDFs/CSVs" }) },
    update: { isActive: true },
  })
  console.log("  ✓ data sources")

  // 5. Audit
  await db.auditLog.create({
    data: {
      actor: "system",
      action: "SEED",
      entityType: "System",
      details: `Seeded real EGX registry (${EGX_COMPANIES.length} companies, no financial data), ${metricCount} metric definitions, ${presets.length} presets`,
    },
  })

  const companyCount = await db.company.count()
  const reportCount = await db.financialReport.count()
  const valueCount = await db.financialValue.count()
  console.log(`\nFinal state: ${companyCount} companies · ${reportCount} reports · ${valueCount} financial values`)
  console.log("No demo financial data present. Upload real statements via the admin pipeline.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
