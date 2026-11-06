// Canonical EGX sector taxonomy used across the app.
//
// Source: the EGX sector indices published by Mubasher / AskBorsa. The old
// coarse list ("Financial Services", "Consumer", "Investment") mis-grouped
// whole companies — e.g. UNIT (United Housing) was Financial Services, FWRY
// (Fawry) was Financial Services instead of Telecom/IT, ELKA (El Kahera
// Housing) was Financial Services instead of Real Estate.
//
// Keep this list ordered like the EGX sector indices. `Other` is the honest
// fallback for companies that are not in any published sector index.

export const SECTORS = [
  "Banks",
  "Financial Services",
  "Real Estate",
  "Construction",
  "Basic Materials",
  "Building Materials",
  "Food",
  "Healthcare",
  "Industrial",
  "Travel & Leisure",
  "Telecom",
  "Transport",
  "Trade",
  "Energy",
  "Education",
  "Textiles",
  "Paper",
  "Chemicals",
  "Other",
] as const

export type Sector = (typeof SECTORS)[number]

export const SECTOR_AR: Record<string, string> = {
  Banks: "البنوك",
  "Financial Services": "الخدمات المالية غير المصرفية",
  "Real Estate": "العقارات",
  Construction: "المقاولات والإنشاءات الهندسية",
  "Basic Materials": "الموارد الأساسية",
  "Building Materials": "مواد البناء",
  Food: "الأغذية والمشروبات والتبغ",
  Healthcare: "الرعاية الصحية والأدوية",
  Industrial: "الخدمات والمنتجات الصناعية والسيارات",
  "Travel & Leisure": "السياحة والترفيه",
  Telecom: "الاتصالات والإعلام وتكنولوجيا المعلومات",
  Transport: "خدمات النقل والشحن",
  Trade: "التجارة والموزعون",
  Energy: "الطاقة والخدمات المساندة",
  Education: "الخدمات التعليمية",
  Textiles: "المنسوجات والسلع المعمرة",
  Paper: "الورق ومواد التعبئة والتغليف",
  Chemicals: "الكيماويات",
  Other: "أخرى",
  // legacy values kept for old rows until every company is re-mapped
  Consumer: "المستهلك",
  Investment: "الاستثمار",
  Utilities: "المرافق",
  Insurance: "التأمين",
}

export function sectorLabel(sector: string, lang: string): string {
  return lang === "ar" ? SECTOR_AR[sector] ?? sector : sector
}
