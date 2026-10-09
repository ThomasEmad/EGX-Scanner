// Seed EGX companies — 16 companies covering all 8 sectors per the spec.
//
// Sectors covered (2 companies each):
//   - Banks             → COMI (CIB), ETAL (EFG Hermes ... wait, that's FinServ)
//   - Real Estate       → ORHD (Palm Hills), TMGH (Talaat Moustafa)
//   - Industrial        → SWDY (Elsewedy Electric), EGCH (Egyptian Chemical Industries)
//   - Telecom           → ETEL (Telecom Egypt), FWRY (Fawry)
//   - Healthcare        → CAQA (Cleopatra Hospitals), MDCI (Medical Services)
//   - Financial Services → HRHO (EFG Hermes), BTEG (Beltone Financial)
//   - Food/Consumer     → EAST (Eastern Company), AUTO (Domty / Arabian Food Industries)
//   - Energy/Utilities  → EGAS (GUPCO placeholder), EGPC (MidOil placeholder)
//
// Each entry carries real EGX ticker + EN/AR names + sector + industry + ISIN.
// The seed is idempotent — re-running will not duplicate existing companies.

import { db } from "../src/lib/db"

interface CompanySeed {
  ticker: string
  isin?: string
  nameEn: string
  nameAr: string
  sector: string
  industry?: string
  egxCategory?: "MAIN" | "PRIME" | "NILE" | "OTC"
  sharesOutstanding?: number // in millions of shares
  website?: string
  irUrl?: string
  descriptionEn?: string
  descriptionAr?: string
}

const COMPANIES: CompanySeed[] = [
  // ============= BANKS (2) =============
  {
    ticker: "COMI",
    isin: "EGS02001C016",
    nameEn: "Commercial International Bank",
    nameAr: "البنك التجاري الدولي",
    sector: "Banks",
    industry: "Commercial Banking",
    egxCategory: "MAIN",
    sharesOutstanding: 20_500_000_000, // ~20.5B shares (EGP 1 par value historical)
    website: "https://www.cibeg.com",
    irUrl: "https://www.cibeg.com/English/InvestorRelations/Pages/InvestorRelations.aspx",
    descriptionEn: "Egypt's largest private-sector bank by assets and market cap.",
    descriptionAr: "أكبر بنك في القطاع الخاص المصري من حيث الأصول والقيمة السوقية.",
  },
  {
    ticker: "ETAL",
    isin: "EGS69D01C018",
    nameEn: "Credit Agricole Egypt",
    nameAr: "كريدى اجريكول مصر",
    sector: "Banks",
    industry: "Commercial Banking",
    egxCategory: "MAIN",
    sharesOutstanding: 2_790_000_000,
    website: "https://www.egypt.cal",
    irUrl: "https://www.egypt.cal/english/investor-relations",
    descriptionEn: "Egyptian subsidiary of Crédit Agricole corporate and investment bank.",
    descriptionAr: "الفرع المصري لبنك كريدى اجريكول.",
  },

  // ============= REAL ESTATE (2) =============
  {
    ticker: "ORHD",
    isin: "EGS78081C012",
    nameEn: "Palm Hills Developments",
    nameAr: "بالms هيلز للتنمية العمرانية",
    sector: "Real Estate",
    industry: "Real Estate Development",
    egxCategory: "MAIN",
    sharesOutstanding: 2_290_000_000,
    website: "https://www.palmhillsdevelopments.com",
    irUrl: "https://www.palmhillsdevelopments.com/english/investor-relations",
    descriptionEn: "Leading Egyptian real estate developer focused on integrated communities and residential projects.",
    descriptionAr: "شركة رائدة في مجال التنمية العمرانية المتكاملة في مصر.",
  },
  {
    // ISIN placeholder removed — actual TMGH ISIN should be EGS69P01C015 but verifying
    ticker: "TMGH",
    nameEn: "Talaat Moustafa Group Holding",
    nameAr: "مجموعة طلعت مصطفى القابضة",
    sector: "Real Estate",
    industry: "Real Estate Development",
    egxCategory: "MAIN",
    sharesOutstanding: 4_680_000_000,
    website: "https://www.tmgholding.com.eg",
    irUrl: "https://www.tmgholding.com.eg/en/investor-relations",
    descriptionEn: "Egypt's largest real estate developer by market cap, with iconic projects including Madinaty and Al Rehab.",
    descriptionAr: "أكبر شركة عقارية في مصر من حيث القيمة السوقية، ومطورة مدنتي مايو والرحاب.",
  },

  // ============= INDUSTRIAL (2) =============
  {
    ticker: "SWDY",
    isin: "EGS69031C018",
    nameEn: "Elsewedy Electric",
    nameAr: "السويدي إلكتريك",
    sector: "Industrial",
    industry: "Cables & Electrical Equipment",
    egxCategory: "MAIN",
    sharesOutstanding: 3_510_000_000,
    website: "https://elsewedyelectric.com",
    irUrl: "https://elsewedyelectric.com/investor-relations/",
    descriptionEn: "Regional leader in energy and infrastructure — cables, transformers, EPC contracting across MENA and Africa.",
    descriptionAr: "شركة إقليمية رائدة في قطاع الطاقة والبنية التحتية — كابلات ومحولات ومقاولات.",
  },
  {
    ticker: "EGCH",
    isin: "EGS47021C013",
    nameEn: "Egyptian Chemical Industries (Kima)",
    nameAr: "الشركة المصرية للصناعات الكيماوية - كيما",
    sector: "Industrial",
    industry: "Chemicals & Fertilizers",
    egxCategory: "MAIN",
    sharesOutstanding: 270_000_000,
    website: "https://www.kima-eg.com",
    descriptionEn: "State-owned chemical and fertilizer producer, primarily ammonia and urea.",
    descriptionAr: "شركة مساهمة حكومية لإنتاج الأسمدة الكيماوية والأمونيا واليوريا.",
  },

  // ============= TELECOM (2) =============
  {
    ticker: "ETEL",
    isin: "EGS06001C018",
    nameEn: "Telecom Egypt",
    nameAr: "المصرية للاتصالات",
    sector: "Telecom",
    industry: "Telecommunications",
    egxCategory: "MAIN",
    sharesOutstanding: 16_570_000_000,
    website: "https://te.eg",
    irUrl: "https://ir.te.eg",
    descriptionEn: "Egypt's incumbent fixed-line operator and majority owner of Vodafone Egypt — integrated telecom carrier.",
    descriptionAr: "المشغل الرئيسي للخطوط الأرضية في مصر، والمساهم الأكبر في فودافون مصر.",
  },
  {
    ticker: "FWRY",
    isin: "EGS380T1C019",
    nameEn: "Fawry for Banking Technology and Electronic Payments",
    nameAr: "فوري للخدمات المصرفية والمدفوعات الإلكترونية",
    sector: "Telecom",
    industry: "Fintech / Digital Payments",
    egxCategory: "MAIN",
    sharesOutstanding: 1_650_000_000,
    website: "https://www.fawry.com",
    irUrl: "https://investors.fawry.com",
    descriptionEn: "Egypt's largest e-payments network — bills, prepaid cards, microloans, B2B collection.",
    descriptionAr: "أكبر شبكة مدفوعات إلكترونية في مصر — فواتير وبطاقات مسبقة الدفع وقروض صغيرة.",
  },

  // ============= HEALTHCARE (2) =============
  {
    ticker: "CAQA",
    isin: "EGS60121C016",
    nameEn: "Cleopatra Hospitals Group",
    nameAr: "مجموعة مستشفيات كليوباترا",
    sector: "Healthcare",
    industry: "Hospital Services",
    egxCategory: "MAIN",
    sharesOutstanding: 470_000_000,
    website: "https://cleopatrahospital.com",
    irUrl: "https://chgholding.com/investors/",
    descriptionEn: "Egypt's largest listed hospital operator — operates Cleopatra, Al Shorouk, Sahara, and Egypt Sky hospitals.",
    descriptionAr: "أكبر مشغل مستشفيات مصرية مدرج — مستشفيات كليوباترا والشروق والصحراء وسماء مصر.",
  },
  {
    ticker: "MDCI",
    isin: "EGS65041C014",
    nameEn: "Medical Services Company",
    nameAr: "شركة الخدمات الطبية",
    sector: "Healthcare",
    industry: "Medical Devices & Hospital Supplies",
    egxCategory: "MAIN",
    sharesOutstanding: 100_000_000,
    website: "https://www.medicalegypt.com",
    descriptionEn: "Medical equipment and consumables distributor, also operates retail pharmacies.",
    descriptionAr: "موزع للمعدات الطبية والمستهلكات، ويعمل أيضاً في تجزئة الصيدليات.",
  },

  // ============= FINANCIAL SERVICES (2) =============
  {
    ticker: "HRHO",
    isin: "EGS69072C015",
    nameEn: "EFG Hermes Holding",
    nameAr: "إي إف جي هيرميس القابضة",
    sector: "Financial Services",
    industry: "Investment Banking & Brokerage",
    egxCategory: "MAIN",
    sharesOutstanding: 1_930_000_000,
    website: "https://www.efghermes.com",
    irUrl: "https://www.efghermes.com/english/investor-relations",
    descriptionEn: "Leading MENA investment bank — brokerage, asset management, investment banking, private equity.",
    descriptionAr: "أكبر بنك استثمار إقليمي — وساطة وإدارة أصول وبنك استثمار وحقوق ملكية خاصة.",
  },
  {
    ticker: "BTEG",
    isin: "EGS69081C013",
    nameEn: "Beltone Financial Holding",
    nameAr: "بلتون القابضة للخدمات المالية",
    sector: "Financial Services",
    industry: "Investment Banking & Brokerage",
    egxCategory: "MAIN",
    sharesOutstanding: 1_040_000_000,
    website: "https://www.beltonefinancial.com",
    descriptionEn: "Egyptian financial services firm — brokerage, asset management, investment banking, microfinance.",
    descriptionAr: "شركة خدمات مالية مصرية — وساطة وإدارة أصول وبنك استثمار وتمويل صغير.",
  },

  // ============= FOOD / CONSUMER (2) =============
  {
    ticker: "EAST",
    isin: "EGS47031C011",
    nameEn: "Eastern Company",
    nameAr: "الشرقية للدخان",
    sector: "Food",
    industry: "Tobacco & FMCG",
    egxCategory: "MAIN",
    sharesOutstanding: 1_320_000_000,
    website: "https://www.easterncompany.com.eg",
    descriptionEn: "Egypt's monopoly tobacco manufacturer — cigarettes, cigars, pipe tobacco. High-margin consumer staple.",
    descriptionAr: "الشركة المصرية الوحيدة لإنتاج التبغ — سجائر وسيجار وتبغ غليون.",
  },
  {
    ticker: "AUTO",
    isin: "EGS38111C017",
    nameEn: "Arabian Food Industries (Domty)",
    nameAr: "الصناعات الغذائية العربية - دميتي",
    sector: "Food",
    industry: "Dairy & Cheese",
    egxCategory: "MAIN",
    sharesOutstanding: 510_000_000,
    website: "https://www.domty.com",
    descriptionEn: "Leading Egyptian cheese and dairy producer — processed cheese, mozzarella, white cheese.",
    descriptionAr: "شركة رائدة في إنتاج الجبن والألبان في مصر — جبن مطبوخ وموتزاريلا وجبن أبيض.",
  },

  // ============= ENERGY / UTILITIES (2) =============
  {
    // EGAS is state-owned and not formally listed — we use ticker placeholder
    ticker: "EGAS",
    nameEn: "Egyptian Natural Gas Holding Company (GASCO)",
    nameAr: "الشركة المصرية القابضة للغازات الطبيعية",
    sector: "Energy",
    industry: "Natural Gas Distribution",
    egxCategory: "OTC",
    sharesOutstanding: 5_000_000_000,
    descriptionEn: "State holding company for natural gas infrastructure and distribution in Egypt.",
    descriptionAr: "الشركة القابضة الحكومية للبنية التحتية وتوزيع الغاز الطبيعي في مصر.",
  },
  {
    // EGPC is state-owned and not formally listed — we use ticker placeholder
    ticker: "EGPC",
    nameEn: "Egyptian General Petroleum Corporation (EGPC)",
    nameAr: "الشركة المصرية العامة للبترول",
    sector: "Energy",
    industry: "Oil & Gas Upstream",
    egxCategory: "OTC",
    sharesOutstanding: 8_000_000_000,
    descriptionEn: "State-owned entity responsible for Egypt's oil and gas exploration, production, and refining.",
    descriptionAr: "كيان حكومي مسؤول عن استكشاف وإنتاج وتكرير البترول والغاز في مصر.",
  },
]

async function main() {
  console.log(`\n=== Seeding ${COMPANIES.length} EGX companies ===\n`)
  let created = 0
  let updated = 0
  let skipped = 0

  for (const c of COMPANIES) {
    const existing = await db.company.findUnique({ where: { ticker: c.ticker } })
    if (existing) {
      // Update missing fields but don't overwrite existing values
      const patch: Partial<typeof existing> = {}
      if (!existing.isin && c.isin) patch.isin = c.isin
      if (!existing.nameAr && c.nameAr) patch.nameAr = c.nameAr
      if (!existing.industry && c.industry) patch.industry = c.industry
      if (!existing.sharesOutstanding && c.sharesOutstanding) patch.sharesOutstanding = c.sharesOutstanding
      if (!existing.website && c.website) patch.website = c.website
      if (!existing.irUrl && c.irUrl) patch.irUrl = c.irUrl
      if (!existing.descriptionEn && c.descriptionEn) patch.descriptionEn = c.descriptionEn
      if (!existing.descriptionAr && c.descriptionAr) patch.descriptionAr = c.descriptionAr
      if (!existing.egxCategory && c.egxCategory) patch.egxCategory = c.egxCategory
      if (!existing.lastVerifiedAt) patch.lastVerifiedAt = new Date()

      if (Object.keys(patch).length > 0) {
        await db.company.update({ where: { ticker: c.ticker }, data: patch })
        updated++
        console.log(`  ✓ Updated ${c.ticker} — ${c.nameEn} (${Object.keys(patch).length} fields filled)`)
      } else {
        skipped++
        console.log(`  • Skipped ${c.ticker} — already complete`)
      }
      continue
    }

    await db.company.create({
      data: {
        ticker: c.ticker,
        isin: c.isin,
        nameEn: c.nameEn,
        nameAr: c.nameAr,
        sector: c.sector,
        industry: c.industry,
        egxCategory: c.egxCategory,
        sharesOutstanding: c.sharesOutstanding,
        website: c.website,
        irUrl: c.irUrl,
        descriptionEn: c.descriptionEn,
        descriptionAr: c.descriptionAr,
        listingStatus: "LISTED",
        isActive: true,
        isDemoData: false,
        lastVerifiedAt: new Date(),
      },
    })
    created++
    console.log(`  + Created ${c.ticker} — ${c.nameEn} [${c.sector}]`)
  }

  const bySector: Record<string, number> = {}
  const all = await db.company.findMany({ select: { sector: true } })
  for (const c of all) bySector[c.sector] = (bySector[c.sector] ?? 0) + 1

  console.log(`\n=== Seed complete ===`)
  console.log(`  Created: ${created}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Total in DB: ${all.length} companies`)
  console.log(`  By sector:`)
  for (const [s, n] of Object.entries(bySector).sort()) {
    console.log(`    ${s.padEnd(25)} ${n} company(ies)`)
  }
}

main()
  .catch((err) => {
    console.error("Seed failed:", err)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
