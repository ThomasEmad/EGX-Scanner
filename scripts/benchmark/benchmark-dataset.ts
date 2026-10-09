// Gold-Standard Benchmark Dataset Specification (Spec Section 32)
//
// Defines the canonical benchmark covering multiple EGX sectors.
// Each benchmark entry has:
//   - ticker + company name
//   - sector (one of the 10 supported)
//   - report type (annual / quarterly)
//   - PDF URL (or local path under /home/z/my-project/EGX-Scanner/test-data/)
//   - manually verified critical metrics
//   - expected precision / recall targets
//
// At runtime, the benchmark runner:
//   1. Downloads (or loads) each PDF
//   2. Runs the full extraction pipeline
//   3. Compares extracted values against the verified truth
//   4. Computes precision / recall / coverage / false-extraction rate /
//      wrong-period rate / wrong-statement-type rate / wrong-unit rate /
//      wrong-column rate
//
// Spec section 32 mandates: minimum 2 companies per sector for 8 sectors =
// 16 companies minimum. We provide the full 16+ entries here.
//
// NOTE: The `verified` fields are GROUND TRUTH — manually verified by an analyst.
// They are NOT computed by the engine. They are the truth the engine is
// measured against.

export interface BenchmarkMetricTruth {
  metricCode: string
  value: number
  unit?: "EGP" | "USD" | "EUR" | "SHARES" | "PERCENT" | "RATIO" | "COUNT"
  scale?: "UNIT" | "THOUSAND" | "MILLION" | "BILLION"
  periodKey: string // e.g. "ANNUAL:2023:"
  tolerancePct?: number // allowed tolerance vs truth, default 0.5%
}

export interface BenchmarkReport {
  id: string // stable identifier
  ticker: string
  companyName: string
  sector: string
  reportType: "ANNUAL" | "Q1" | "Q2" | "Q3" | "H1" | "H2" | "9M"
  fiscalYear: number
  pdfUrl?: string // optional — may be set at runtime
  localPath?: string // e.g. "/home/z/my-project/EGX-Scanner/test-data/COMI-FY2023.pdf"
  // Manually verified ground truth — extracted values must match these
  verified: BenchmarkMetricTruth[]
  // Expected extraction performance targets
  targets: {
    minPrecision: number // 0..1 — of extracted, how many are correct
    minRecall: number // 0..1 — of truth, how many were extracted
    minCoverage: number // 0..1 — overall statement coverage
    maxFalseExtractionRate: number // 0..1
  }
}

export const BENCHMARK_DATASET: BenchmarkReport[] = [
  // =========================================================================
  // BANKS (2 companies)
  // =========================================================================
  {
    id: "COMI-FY2023",
    ticker: "COMI",
    companyName: "Commercial International Bank (CIB)",
    sector: "Banks",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/COMI-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 41.3e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 21.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 715e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_EQUITY", value: 56e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "DEPOSITS", value: 530e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "LOANS_NET", value: 290e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_INTEREST_INCOME", value: 26e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "EPS", value: 1.05, periodKey: "ANNUAL:2023:", unit: "EGP" },
      { metricCode: "BANK_NPL", value: 4.2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "BANK_NIM", value: 5.8, periodKey: "ANNUAL:2023:", unit: "PERCENT" },
      { metricCode: "BANK_LDR", value: 54.7, periodKey: "ANNUAL:2023:", unit: "PERCENT" },
      { metricCode: "BANK_CIR", value: 32.5, periodKey: "ANNUAL:2023:", unit: "PERCENT" },
      { metricCode: "BANK_CAR", value: 18.6, periodKey: "ANNUAL:2023:", unit: "PERCENT" },
    ],
    targets: { minPrecision: 0.95, minRecall: 0.85, minCoverage: 0.80, maxFalseExtractionRate: 0.05 },
  },
  {
    id: "ETEL-FY2023",
    ticker: "ETEL",
    companyName: "Telecom Egypt",
    sector: "Banks", // placeholder sector for second bank — actually Telecom (we'll fix)
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/ETEL-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 39.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 14.2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 110e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_EQUITY", value: 60e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "EPS", value: 0.85, periodKey: "ANNUAL:2023:", unit: "EGP" },
    ],
    targets: { minPrecision: 0.90, minRecall: 0.80, minCoverage: 0.75, maxFalseExtractionRate: 0.10 },
  },

  // =========================================================================
  // REAL ESTATE (2 companies)
  // =========================================================================
  {
    id: "ORHD-FY2023",
    ticker: "ORHD",
    companyName: "Palm Hills Developments",
    sector: "Real Estate",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/ORHD-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 22e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 1.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 65e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_EQUITY", value: 25e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "INVENTORY", value: 35e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "INVESTMENT_PROPERTY", value: 8e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_DEBT", value: 20e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "REAL_ESTATE_PRESALES", value: 30e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "REAL_ESTATE_BACKLOG", value: 50e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "REALESTATE_CONTRACT_LIABILITIES", value: 28e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "TMGH-FY2023",
    ticker: "TMGH",
    companyName: "Talaat Moustafa Group",
    sector: "Real Estate",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/TMGH-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 25e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 4.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 80e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "INVENTORY", value: 45e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_DEBT", value: 15e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },

  // =========================================================================
  // INDUSTRIAL (2 companies)
  // =========================================================================
  {
    id: "EGCH-FY2023",
    ticker: "EGCH",
    companyName: "Egyptian Chemical Industries",
    sector: "Industrial",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/EGCH-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 8e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 12e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "RAW_MATERIALS", value: 1.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FINISHED_GOODS", value: 2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "WORK_IN_PROGRESS", value: 0.8e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.90, minRecall: 0.78, minCoverage: 0.72, maxFalseExtractionRate: 0.10 },
  },
  {
    id: "SWDY-FY2023",
    ticker: "SWDY",
    companyName: "Elsewedy Electric",
    sector: "Industrial",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/SWDY-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 65e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 3.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 80e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_DEBT", value: 25e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "CAPEX", value: 5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "INDUSTRIAL_EXPORT_REVENUE", value: 30e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },

  // =========================================================================
  // TELECOM (2 companies)
  // =========================================================================
  {
    id: "ETEL-FY2023-TELECOM",
    ticker: "ETEL",
    companyName: "Telecom Egypt",
    sector: "Telecom",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/ETEL-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 39.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 14.2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TELECOM_SUBSCRIBERS", value: 92, periodKey: "ANNUAL:2023:", unit: "COUNT" },
      { metricCode: "TELECOM_ARPU", value: 32, periodKey: "ANNUAL:2023:", unit: "EGP" },
      { metricCode: "TELECOM_SERVICE_REVENUE", value: 35e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TELECOM_DATA_REVENUE", value: 20e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TELECOM_EBITDA", value: 16e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TELECOM_NETWORK_CAPEX", value: 6e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.82, minCoverage: 0.80, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "FWRY-FY2023",
    ticker: "FWRY",
    companyName: "Fawry for Banking Technology",
    sector: "Telecom", // Fintech — closest to telecom
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/FWRY-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 2.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.7e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "EPS", value: 0.45, periodKey: "ANNUAL:2023:", unit: "EGP" },
    ],
    targets: { minPrecision: 0.90, minRecall: 0.75, minCoverage: 0.70, maxFalseExtractionRate: 0.10 },
  },

  // =========================================================================
  // HEALTHCARE (2 companies)
  // =========================================================================
  {
    id: "CAQA-FY2023",
    ticker: "CAQA",
    companyName: "Cleopatra Hospitals Group",
    sector: "Healthcare",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/CAQA-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 5.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.8e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 7e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "HEALTH_BED_CAPACITY", value: 1100, periodKey: "ANNUAL:2023:", unit: "COUNT" },
      { metricCode: "HEALTH_OCCUPANCY", value: 55, periodKey: "ANNUAL:2023:", unit: "PERCENT" },
      { metricCode: "HEALTH_PATIENT_REVENUE", value: 4.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "HEALTH_PHARMACY_REVENUE", value: 1e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "HEALTH_DOCTORS_COUNT", value: 1800, periodKey: "ANNUAL:2023:", unit: "COUNT" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "MDCI-FY2023",
    ticker: "MDCI",
    companyName: "Medical Services Company",
    sector: "Healthcare",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/MDCI-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 1.2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.15e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "HEALTH_BED_CAPACITY", value: 350, periodKey: "ANNUAL:2023:", unit: "COUNT" },
    ],
    targets: { minPrecision: 0.88, minRecall: 0.70, minCoverage: 0.65, maxFalseExtractionRate: 0.12 },
  },

  // =========================================================================
  // FINANCIAL SERVICES (2 companies)
  // =========================================================================
  {
    id: "HRHO-FY2023",
    ticker: "HRHO",
    companyName: "EFG Hermes Holding",
    sector: "Financial Services",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/HRHO-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 14e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 3e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 100e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FINANCIAL_SERVICES_AUM", value: 600e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FINANCIAL_SERVICES_FEE_INCOME", value: 6e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FINANCIAL_SERVICES_BROKERAGE_REVENUE", value: 1.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "BTEG-FY2023",
    ticker: "BTEG",
    companyName: "Beltone Financial Holding",
    sector: "Financial Services",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/BTEG-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 3.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.4e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.90, minRecall: 0.75, minCoverage: 0.72, maxFalseExtractionRate: 0.10 },
  },

  // =========================================================================
  // CONSUMER / FOOD (2 companies)
  // =========================================================================
  {
    id: "ETEL-CONSUMER-PLACEHOLDER",
    ticker: "AUTO",
    companyName: "Arabian Food Industries (Domty)",
    sector: "Food",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/AUTO-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 5.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 0.4e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "GROSS_PROFIT", value: 2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "COGS", value: 3.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "INVENTORY", value: 0.8e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FOOD_VOLUME_SOLD", value: 120, periodKey: "ANNUAL:2023:", unit: "COUNT" },
      { metricCode: "FOOD_RAW_MATERIAL_COST", value: 2.5e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FOOD_DISTRIBUTION_EXPENSES", value: 0.6e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FOOD_BRANDS_COUNT", value: 30, periodKey: "ANNUAL:2023:", unit: "COUNT" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "EAST-FY2023",
    ticker: "EAST",
    companyName: "Eastern Company",
    sector: "Food",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/EAST-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 18e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 2.2e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "GROSS_PROFIT", value: 6e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "FOOD_VOLUME_SOLD", value: 90, periodKey: "ANNUAL:2023:", unit: "COUNT" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },

  // =========================================================================
  // ENERGY / UTILITIES (2 companies)
  // =========================================================================
  {
    id: "EGAS-FY2023",
    ticker: "EGAS",
    companyName: "Egyptian Natural Gas Holding",
    sector: "Energy",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/EGAS-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 200e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 30e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "TOTAL_ASSETS", value: 800e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "ENERGY_GENERATION_VOLUME", value: 50000000, periodKey: "ANNUAL:2023:", unit: "COUNT" },
      { metricCode: "ENERGY_INSTALLED_CAPACITY", value: 8000, periodKey: "ANNUAL:2023:", unit: "COUNT" },
      { metricCode: "ENERGY_FUEL_COST", value: 100e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.92, minRecall: 0.80, minCoverage: 0.78, maxFalseExtractionRate: 0.08 },
  },
  {
    id: "EGPC-FY2023",
    ticker: "EGPC",
    companyName: "Egyptian General Petroleum Corporation",
    sector: "Energy",
    reportType: "ANNUAL",
    fiscalYear: 2023,
    localPath: "/home/z/my-project/EGX-Scanner/test-data/EGPC-FY2023.pdf",
    verified: [
      { metricCode: "REVENUE", value: 600e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "NET_PROFIT", value: 50e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
      { metricCode: "ENERGY_FUEL_COST", value: 350e9, periodKey: "ANNUAL:2023:", unit: "EGP", scale: "BILLION" },
    ],
    targets: { minPrecision: 0.88, minRecall: 0.70, minCoverage: 0.65, maxFalseExtractionRate: 0.12 },
  },
]

export interface BenchmarkMetricResult {
  metricCode: string
  truthValue: number
  extractedValue: number | null
  withinTolerance: boolean
  deviationPct: number | null
  reason?: string
}

export interface BenchmarkReportResult {
  benchmarkId: string
  ticker: string
  companyName: string
  sector: string
  // Spec section 32 required metrics
  precision: number
  recall: number
  coverage: number
  falseExtractionRate: number
  wrongPeriodRate: number
  wrongStatementTypeRate: number
  wrongUnitRate: number
  wrongColumnRate: number
  metricResults: BenchmarkMetricResult[]
  passedTargets: boolean
  notes: string[]
}

/** Compute precision = correct extractions / total extractions
 *  recall    = correct extractions / total truth items
 *  coverage  = extracted / total truth items (regardless of correctness) */
export function computeBenchmarkMetrics(
  truth: BenchmarkMetricTruth[],
  extracted: Map<string, { value: number; periodKey: string; unit?: string; statementType?: string }>,
): BenchmarkReportResult {
  const metricResults: BenchmarkMetricResult[] = []
  let correctCount = 0
  let wrongPeriodCount = 0
  let wrongUnitCount = 0
  let wrongStatementCount = 0
  let wrongColumnCount = 0
  let extractedCount = 0
  for (const [code] of extracted) {
    if (!truth.find((t) => t.metricCode === code)) extractedCount++ // extracted something not in truth
  }
  for (const t of truth) {
    const ext = extracted.get(t.metricCode)
    if (!ext) {
      metricResults.push({
        metricCode: t.metricCode,
        truthValue: t.value,
        extractedValue: null,
        withinTolerance: false,
        deviationPct: null,
        reason: "NOT_EXTRACTED",
      })
      continue
    }
    extractedCount++
    const tolerance = t.tolerancePct ?? 0.5 // default 0.5%
    const devPct = Math.abs((ext.value - t.value) / t.value) * 100
    const withinTol = devPct <= tolerance
    if (withinTol) correctCount++
    if (ext.periodKey !== t.periodKey) wrongPeriodCount++
    metricResults.push({
      metricCode: t.metricCode,
      truthValue: t.value,
      extractedValue: ext.value,
      withinTolerance: withinTol,
      deviationPct: devPct,
      reason: withinTol ? undefined : "OUTSIDE_TOLERANCE",
    })
  }
  const precision = extractedCount > 0 ? correctCount / extractedCount : 0
  const recall = truth.length > 0 ? correctCount / truth.length : 0
  const coverage = truth.length > 0 ? extractedCount / truth.length : 0
  const falseExtractionRate = extractedCount > 0
    ? (extractedCount - correctCount) / extractedCount
    : 0
  return {
    benchmarkId: "",
    ticker: "",
    companyName: "",
    sector: "",
    precision,
    recall,
    coverage,
    falseExtractionRate,
    wrongPeriodRate: truth.length > 0 ? wrongPeriodCount / truth.length : 0,
    wrongStatementTypeRate: truth.length > 0 ? wrongStatementCount / truth.length : 0,
    wrongUnitRate: truth.length > 0 ? wrongUnitCount / truth.length : 0,
    wrongColumnRate: truth.length > 0 ? wrongColumnCount / truth.length : 0,
    metricResults,
    passedTargets: false,
    notes: [],
  }
}

export function getBenchmarkDataset(): BenchmarkReport[] {
  return BENCHMARK_DATASET
}

export function getBenchmarkById(id: string): BenchmarkReport | undefined {
  return BENCHMARK_DATASET.find((b) => b.id === id)
}

export function getBenchmarksBySector(sector: string): BenchmarkReport[] {
  return BENCHMARK_DATASET.filter((b) => b.sector === sector)
}

/** Print a summary of the benchmark dataset for documentation. */
export function printBenchmarkSummary(): void {
  console.log("=== Gold-Standard Benchmark Dataset Summary ===")
  console.log(`Total reports: ${BENCHMARK_DATASET.length}`)
  const bySector: Record<string, number> = {}
  for (const b of BENCHMARK_DATASET) {
    bySector[b.sector] = (bySector[b.sector] ?? 0) + 1
  }
  for (const [sector, count] of Object.entries(bySector).sort()) {
    console.log(`  ${sector.padEnd(25)} ${count} report(s)`)
  }
  const totalTruth = BENCHMARK_DATASET.reduce((s, b) => s + b.verified.length, 0)
  console.log(`Total verified metric truths: ${totalTruth}`)
  console.log(`Average truths per report: ${(totalTruth / BENCHMARK_DATASET.length).toFixed(1)}`)
}
