// Sector Applicability — defines which metrics are meaningful per sector.
// Spec section 9 (Liquidity & Solvency Engine): "Sector-specific applicability
// must be respected. Some ratios are less meaningful for banks. Do not blindly
// calculate every ratio for every company."
//
// Spec section 28: "A bank should expose different financial facts from a
// real-estate developer."
//
// This module is consumed by:
//   - The derivation engine (skip ratios that don't apply)
//   - The coverage report (only flag missing metrics relevant to the sector)
//   - The investor signal engine (suppress sector-irrelevant signals)

import type { StatementType } from "../registry"

export type SectorCode =
  | "BANKS"
  | "REAL_ESTATE"
  | "INDUSTRIAL"
  | "TELECOM"
  | "HEALTHCARE"
  | "FOOD_CONSUMER"
  | "ENERGY_UTILITIES"
  | "INVESTMENT_HOLDING"
  | "FINANCIAL_SERVICES"
  | "OTHER"

export interface SectorDef {
  code: SectorCode
  labelEn: string
  labelAr: string
  /** Sector-specific metric codes (besides the universal set) */
  sectorMetrics: string[]
  /** Metrics that should be SUPPRESSED for this sector (e.g. inventory for banks) */
  suppressedMetrics?: string[]
  /** Ratios that don't apply (e.g. DSO for banks — they don't have trade receivables) */
  suppressedRatios?: string[]
  /** Statement types this sector primarily reports (banks may not have inventory) */
  primaryStatements: StatementType[]
}

/** Universal metrics — meaningful for ALL sectors. The sector overlay adds
 *  sector-specific metrics on top of these. */
export const UNIVERSAL_METRICS: string[] = [
  "REVENUE", "OPERATING_INCOME", "NET_PROFIT", "NET_PROFIT_PARENT",
  "EPS", "BASIC_EPS", "DILUTED_EPS", "WEIGHTED_AVG_SHARES",
  "PROFIT_BEFORE_TAX", "INCOME_TAX", "FINANCE_COST",
  "TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY", "EQUITY_PARENT",
  "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES",
  "CASH_AND_EQUIVALENTS", "ACCOUNTS_RECEIVABLE",
  "SHORT_TERM_DEBT", "LONG_TERM_DEBT", "TOTAL_DEBT", "LEASE_LIABILITIES",
  "RETAINED_EARNINGS", "SHARES_OUTSTANDING", "SHARE_CAPITAL",
  "OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW",
  "CAPEX", "DEBT_PROCEEDS", "DEBT_REPAYMENTS", "DIVIDENDS_PAID",
  "OPENING_CASH", "CLOSING_CASH",
  "GROSS_PROFIT", "COGS",
  "DEPRECIATION_EXPENSE", "AMORTIZATION_EXPENSE",
  "DPS_DECLARED", "TOTAL_DIVIDENDS_DECLARED", "PAYOUT_RATIO",
  "TREASURY_SHARES",
]

export const SECTOR_DEFS: SectorDef[] = [
  {
    code: "BANKS",
    labelEn: "Banks",
    labelAr: "البنوك",
    sectorMetrics: [
      "NET_INTEREST_INCOME", "DEPOSITS", "LOANS_NET",
      "INTEREST_INCOME", "INTEREST_EXPENSE",
      // Bank-specific operational KPIs (added in expanded ontology extension)
      "BANK_NPL", "BANK_ECL", "BANK_COVERAGE_RATIO", "BANK_CIR",
      "BANK_LDR", "BANK_NIM", "BANK_CET1", "BANK_CAR",
    ],
    suppressedMetrics: ["INVENTORY", "TRADE_RECEIVABLES", "TRADE_PAYABLES", "CAPEX"],
    suppressedRatios: ["DSO", "DIO", "DPO", "CCC", "INVENTORY_TURNOVER", "GROSS_MARGIN"],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "REAL_ESTATE",
    labelEn: "Real Estate",
    labelAr: "العقارات",
    sectorMetrics: [
      "INVESTMENT_PROPERTY", "CONSTRUCTION_IN_PROGRESS",
      "REAL_ESTATE_PRESALES", "REAL_ESTATE_BACKLOG",
      "REALESTATE_CASH_COLLECTIONS", "REALESTATE_CONTRACT_LIABILITIES",
      "REALESTATE_CONTRACT_ASSETS",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "INDUSTRIAL",
    labelEn: "Industrial / Manufacturing",
    labelAr: "الصناعة",
    sectorMetrics: [
      "RAW_MATERIALS", "WORK_IN_PROGRESS", "FINISHED_GOODS",
      "PPE", "INTANGIBLE_ASSETS", "CAPEX",
      "INDUSTRIAL_CAPACITY", "INDUSTRIAL_UTILIZATION", "INDUSTRIAL_EXPORT_REVENUE",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "TELECOM",
    labelEn: "Telecom / Technology",
    labelAr: "الاتصالات",
    sectorMetrics: [
      "TELECOM_SUBSCRIBERS", "TELECOM_ARPU", "TELECOM_CHURN",
      "TELECOM_SERVICE_REVENUE", "TELECOM_DATA_REVENUE",
      "TELECOM_EBITDA", "TELECOM_NETWORK_CAPEX",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "HEALTHCARE",
    labelEn: "Healthcare",
    labelAr: "الرعاية الصحية",
    sectorMetrics: [
      "HEALTH_BED_CAPACITY", "HEALTH_OCCUPANCY",
      "HEALTH_PATIENT_REVENUE", "HEALTH_PHARMACY_REVENUE",
      "HEALTH_DOCTORS_COUNT", "HEALTH_ADMISSIONS",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "FOOD_CONSUMER",
    labelEn: "Consumer / Food",
    labelAr: "الاستهلاكي والأغذية",
    sectorMetrics: [
      "FOOD_RAW_MATERIAL_COST", "FOOD_DISTRIBUTION_EXPENSES",
      "FOOD_VOLUME_SOLD", "FOOD_EXPORT_REVENUE",
      "FOOD_BRANDS_COUNT", "FOOD_SKU_COUNT",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "ENERGY_UTILITIES",
    labelEn: "Energy / Utilities",
    labelAr: "الطاقة والمرافق",
    sectorMetrics: [
      "ENERGY_GENERATION_VOLUME", "ENERGY_INSTALLED_CAPACITY",
      "ENERGY_UTILIZATION", "ENERGY_TARIFF",
      "ENERGY_FUEL_COST", "ENERGY_CO2_EMISSIONS",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "INVESTMENT_HOLDING",
    labelEn: "Investment / Holding",
    labelAr: "الاستثمار القابضة",
    sectorMetrics: [
      "INVESTMENT_INCOME", "ASSOCIATES_JV_INCOME",
      "FAIR_VALUE_GAIN_LOSS", "FVPL_ASSETS", "FVOCI_ASSETS",
      "INVESTMENT_HOLDING_NAV", "INVESTMENT_HOLDING_AUM",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "FINANCIAL_SERVICES",
    labelEn: "Financial Services",
    labelAr: "الخدمات المالية",
    sectorMetrics: [
      "FINANCIAL_SERVICES_AUM", "FINANCIAL_SERVICES_FEE_INCOME",
      "FINANCIAL_SERVICES_BROKERAGE_REVENUE",
      "INVESTMENT_INCOME", "FAIR_VALUE_GAIN_LOSS",
    ],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
  {
    code: "OTHER",
    labelEn: "Other",
    labelAr: "أخرى",
    sectorMetrics: [],
    primaryStatements: ["INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"],
  },
]

export const SECTOR_DEF_MAP: Record<SectorCode, SectorDef> =
  Object.fromEntries(SECTOR_DEFS.map((s) => [s.code, s])) as Record<SectorCode, SectorDef>

/** Heuristic — detect the sector from a company industry string.
 *  Returns the best-matching SectorCode, or "OTHER" if no match. */
export function detectSector(industry?: string | null): SectorCode {
  if (!industry) return "OTHER"
  const s = industry.toLowerCase()
  if (s.includes("bank") || s.includes("بنك")) return "BANKS"
  if (s.includes("real estate") || s.includes("real_estate") || s.includes("realestate") || s.includes("عقار")) return "REAL_ESTATE"
  if (s.includes("industrial") || s.includes("manufactur") || s.includes("صناع")) return "INDUSTRIAL"
  if (s.includes("telecom") || s.includes("telecomunic") || s.includes("اتصال")) return "TELECOM"
  if (s.includes("health") || s.includes("pharma") || s.includes("medical") || s.includes("صحه") || s.includes("رعاية")) return "HEALTHCARE"
  if (s.includes("food") || s.includes("beverage") || s.includes("consumer") || s.includes("اغذية") || s.includes("أغذية")) return "FOOD_CONSUMER"
  if (s.includes("energy") || s.includes("utilit") || s.includes("power") || s.includes("oil") || s.includes("gas") || s.includes("طاقة") || s.includes("بترول")) return "ENERGY_UTILITIES"
  if (s.includes("investment") || s.includes("holding") || s.includes("استثمار") || s.includes("قابضة")) return "INVESTMENT_HOLDING"
  if (s.includes("financial services") || s.includes("financial_services") || s.includes("خدمات مالية")) return "FINANCIAL_SERVICES"
  return "OTHER"
}

/** Get the full metric code set applicable to a sector (universal + sector-specific). */
export function getSectorMetricCodes(sector: SectorCode): string[] {
  const def = SECTOR_DEF_MAP[sector] ?? SECTOR_DEF_MAP.OTHER
  const suppressed = new Set(def.suppressedMetrics ?? [])
  const universal = UNIVERSAL_METRICS.filter((m) => !suppressed.has(m))
  return [...universal, ...def.sectorMetrics]
}

/** Check if a ratio / metric applies to a sector. */
export function appliesToSector(metricCode: string, sector: SectorCode): boolean {
  const def = SECTOR_DEF_MAP[sector] ?? SECTOR_DEF_MAP.OTHER
  if (def.suppressedMetrics?.includes(metricCode)) return false
  return true
}

/** Check if a ratio code (e.g. "DSO", "GROSS_MARGIN") applies to a sector. */
export function ratioAppliesToSector(ratioCode: string, sector: SectorCode): boolean {
  const def = SECTOR_DEF_MAP[sector] ?? SECTOR_DEF_MAP.OTHER
  if (def.suppressedRatios?.includes(ratioCode)) return false
  return true
}
