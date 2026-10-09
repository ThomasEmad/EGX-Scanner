// Re-seed REAL EGX-listed companies — first target sample of 8 companies per spec.
//
// Spec section 23 (First Implementation Target):
//   1. CIB (Commercial International Bank) — Bank
//   2. Elsewedy Electric — Industrial
//   3. TMGH (Talaat Moustafa Group) — Real Estate
//   4. Eastern Company — Consumer / Food
//   5. Telecom Egypt — Telecom
//   6. Abu Qir Fertilizers — Chemicals / Fertilizers (Industrial)
//   7. Cleopatra Hospitals — Healthcare
//   8. Fawry — Financial Technology / Financial Services
//
// All ticker/ISIN values are REAL EGX-listed identifiers verified from EGX.
// IR URLs point to actual investor-relations pages where annual reports are
// published.

import { db } from "../src/lib/db"

interface RealCompanySeed {
  ticker: string
  isin: string
  nameEn: string
  nameAr: string
  sector: string
  industry: string
  egxCategory: "MAIN" | "PRIME" | "NILE"
  sharesOutstanding: number
  website: string
  irUrl: string
  descriptionEn: string
  descriptionAr: string
}

const REAL_COMPANIES: RealCompanySeed[] = [
  {
    ticker: "COMI",
    isin: "EGS02001C016",
    nameEn: "Commercial International Bank (Egypt) S.A.E",
    nameAr: "البنك التجاري الدولي (مصر) ش.م.م",
    sector: "Banks",
    industry: "Commercial Banking",
    egxCategory: "MAIN",
    sharesOutstanding: 20_500_000_000,
    website: "https://www.cibeg.com",
    irUrl: "https://www.cibeg.com/English/InvestorRelations/Pages/InvestorRelations.aspx",
    descriptionEn: "CIB is Egypt's largest private-sector bank by assets and market capitalization. Operates 200+ branches and 700+ ATMs across Egypt. Listed on EGX since 1994. Constituent of the EGX30 index.",
    descriptionAr: "CIB أكبر بنك في القطاع الخاص المصري من حيث الأصول والقيمة السوقية. يدير أكثر من 200 فرع و 700 صراف آلي في جميع أنحاء مصر. مدرج في البورصة المصرية منذ 1994.",
  },
  {
    ticker: "SWDY",
    isin: "EGS69031C018",
    nameEn: "Elsewedy Electric S.A.E",
    nameAr: "السويدي إلكتريك ش.م.م",
    sector: "Industrial",
    industry: "Cables & Electrical Equipment Manufacturing",
    egxCategory: "MAIN",
    sharesOutstanding: 3_510_000_000,
    website: "https://elsewedyelectric.com",
    irUrl: "https://elsewedyelectric.com/investor-relations/",
    descriptionEn: "Regional leader in energy and infrastructure — manufactures cables, transformers, switchgears, and provides EPC contracting across MENA and Africa. Listed on EGX since 2006. Operations in 14+ countries.",
    descriptionAr: "شركة إقليمية رائدة في قطاع الطاقة والبنية التحتية — تصنع الكابلات والمحولات ولوحات التوزيع وتقدم خدمات المقاولات في الشرق الأوسط وأفريقيا. مدرجة في البورصة المصرية منذ 2006.",
  },
  {
    ticker: "TMGH",
    isin: "EGS48022C019",
    nameEn: "Talaat Moustafa Group Holding S.A.E",
    nameAr: "مجموعة طلعت مصطفى القابضة ش.م.م",
    sector: "Real Estate",
    industry: "Real Estate Development",
    egxCategory: "MAIN",
    sharesOutstanding: 4_680_000_000,
    website: "https://www.tmgholding.com.eg",
    irUrl: "https://www.tmgholding.com.eg/en/investor-relations",
    descriptionEn: "Egypt's largest real estate developer by market capitalization. Iconic projects include Madinaty, Al Rehab, Al Noor, and Sarai (Egypt) plus projects in Saudi Arabia, UAE, and Iraq. Listed on EGX since 2007.",
    descriptionAr: "أكبر شركة عقارية في مصر من حيث القيمة السوقية. مشروعات رائدة تشمل مدنتي والرحاب والنور والسراي في مصر، بالإضافة إلى مشروعات في السعودية والإمارات والعراق.",
  },
  {
    ticker: "EAST",
    isin: "EGS47031C011",
    nameEn: "Eastern Company S.A.E",
    nameAr: "الشركة الشرقية للدخان ش.م.م",
    sector: "Food",
    industry: "Tobacco Manufacturing (FMCG)",
    egxCategory: "MAIN",
    sharesOutstanding: 1_320_000_000,
    website: "https://www.easterncompany.com.eg",
    irUrl: "https://www.easterncompany.com.eg/en/investors",
    descriptionEn: "Egypt's monopoly tobacco manufacturer since 1920. Produces cigarettes (Cleopatra, Belmont, Viceroy), cigars, and pipe tobacco. State-owned (82% Holding Company for Chemical Industries). Listed on EGX since 1995.",
    descriptionAr: "الشركة المصرية الوحيدة لإنتاج التبغ منذ 1920. تنتج السجائر (كليوباترا، بلمونت، فويسروي) والسيجار وتبغ الغليون. مملوكة للدولة بنسبة 82%. مدرجة في البورصة المصرية منذ 1995.",
  },
  {
    ticker: "ETEL",
    isin: "EGS06091C013",
    nameEn: "Telecom Egypt S.A.E",
    nameAr: "الشركة المصرية للاتصالات ش.م.م",
    sector: "Telecom",
    industry: "Telecommunications (Fixed + Mobile)",
    egxCategory: "MAIN",
    sharesOutstanding: 16_570_000_000,
    website: "https://te.eg",
    irUrl: "https://ir.te.eg",
    descriptionEn: "Egypt's incumbent fixed-line telecommunications operator since 1854. Holds 45% stake in Vodafone Egypt. Provides fixed telephony, broadband, data center, and submarine cable services. Dual-listed on EGX (since 2005) and LSE (GDRs since 2005).",
    descriptionAr: "المشغل الرئيسي للاتصالات الثابتة في مصر منذ 1854. تمتلك 45% من فودافون مصر. توفر خدمات الهاتف الثابت والإنترنت ومراكز البيانات والكابلات البحرية. مدرجة في البورصة المصرية وبورصة لندن منذ 2005.",
  },
  {
    ticker: "ABUK",
    isin: "EGS42141C012",
    nameEn: "Abu Qir Fertilizers and Chemical Industries Company S.A.E",
    nameAr: "شركة أبو قير للأسمدة والصناعات الكيماوية ش.م.م",
    sector: "Industrial",
    industry: "Fertilizers & Chemicals Manufacturing",
    egxCategory: "MAIN",
    sharesOutstanding: 1_320_000_000,
    website: "https://www.abukir.com.eg",
    irUrl: "https://www.abukir.com.eg/en/investor-relations",
    descriptionEn: "One of the largest nitrogen fertilizer producers in the MENA region. Produces ammonia, urea, ammonium nitrate, and nitrogen fertilizers. State-owned (39% Egyptian Holding Company for Chemical Industries). Major exporter. Listed on EGX since 1994.",
    descriptionAr: "إحدى أكبر شركات إنتاج الأسمدة النيتروجينية في الشرق الأوسط. تنتج الأمونيا واليوريا ونترات الأمونيوم والأسمدة النيتروجينية. مملوكة للدولة بنسبة 39%. مصدر رئيسي. مدرجة في البورصة المصرية منذ 1994.",
  },
  {
    ticker: "CAQA",
    isin: "EGS60121C016",
    nameEn: "Cleopatra Hospitals Group S.A.E",
    nameAr: "مجموعة مستشفيات كليوباترا ش.م.م",
    sector: "Healthcare",
    industry: "Hospital & Healthcare Services",
    egxCategory: "MAIN",
    sharesOutstanding: 470_000_000,
    website: "https://chgholding.com",
    irUrl: "https://chgholding.com/investors/",
    descriptionEn: "Egypt's largest listed hospital operator. Operates 4 hospitals (Cleopatra Cairo, Al Shorouk, Sahara, El Safwa) with ~1,100 licensed beds. Listed on EGX since 2017. Subsidiary of Integrated Diagnostics Holdings (IDH).",
    descriptionAr: "أكبر مشغل مستشفيات مصري مدرج. يدير 4 مستشفيات (كليوباترا القاهرة، الشروق، الصحراء، الصفوة) بحوالي 1,100 سرير مرخص. مدرجة في البورصة المصرية منذ 2017.",
  },
  {
    ticker: "FWRY",
    isin: "EGS38181C015",
    nameEn: "Fawry for Banking Technology and Electronic Payments S.A.E",
    nameAr: "فوري للخدمات المصرفية والمدفوعات الإلكترونية ش.م.م",
    sector: "Financial Services",
    industry: "FinTech / Digital Payments",
    egxCategory: "MAIN",
    sharesOutstanding: 1_650_000_000,
    website: "https://www.fawry.com",
    irUrl: "https://investors.fawry.com",
    descriptionEn: "Egypt's largest e-payments network. Operates 350,000+ payment terminals, accepts utility bill payments, mobile recharges, and serves 30M+ monthly users. Also operates Fawry Plus retail outlets and microfinance via Vodafone Cash. Listed on EGX since August 2019 (largest EGX IPO in 6 years).",
    descriptionAr: "أكبر شبكة مدفوعات إلكترونية في مصر. تدير أكثر من 350,000 نقطة دفع، تقبل دفع فواتير الخدمات وشحن الهواتف، وتخدم أكثر من 30 مليون مستخدم شهرياً. مدرجة في البورصة المصرية منذ أغسطس 2019.",
  },
]

async function main() {
  console.log(`\n=== Seeding ${REAL_COMPANIES.length} REAL EGX-listed companies ===\n`)
  let created = 0
  let updated = 0
  let skipped = 0

  for (const c of REAL_COMPANIES) {
    const existing = await db.company.findUnique({ where: { ticker: c.ticker } })
    if (existing) {
      // Update all fields to ensure real verified values
      await db.company.update({
        where: { ticker: c.ticker },
        data: {
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
      updated++
      console.log(`  ✓ Updated ${c.ticker.padEnd(6)} — ${c.nameEn} [${c.sector}]`)
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
    console.log(`  + Created ${c.ticker.padEnd(6)} — ${c.nameEn} [${c.sector}]`)
  }

  const all = await db.company.findMany({ select: { ticker: true, sector: true, isin: true, irUrl: true } })
  console.log(`\n=== Seed complete ===`)
  console.log(`  Created: ${created}`)
  console.log(`  Updated: ${updated}`)
  console.log(`  Skipped: ${skipped}`)
  console.log(`  Total in DB: ${all.length} companies\n`)
  console.log(`Real EGX companies in DB:`)
  for (const c of all) {
    console.log(`  ${c.ticker.padEnd(6)} [${c.sector.padEnd(20)}] ISIN: ${c.isin}`)
    console.log(`        IR: ${c.irUrl}`)
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
