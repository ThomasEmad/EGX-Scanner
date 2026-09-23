// Financial metric registry — the normalization dictionary.
// Different companies label the same concept differently ("Revenue", "Sales",
// "Net Sales", "إيرادات نشاط الأعمال"). All map to a canonical code like REVENUE.
// NEVER destroy original labels — originals are preserved on FinancialValue rows.

export type StatementType =
  | "INCOME_STATEMENT"
  | "BALANCE_SHEET"
  | "CASH_FLOW"
  | "OTHER"

export interface RawMetricDef {
  code: string
  labelEn: string
  labelAr: string
  statementType: StatementType
  description?: string
  aliases: string[]
  appliesToSectors?: string[] // null/undefined = applies to all sectors
}

export const RAW_METRICS: RawMetricDef[] = [
  // ---------- INCOME STATEMENT ----------
  {
    code: "REVENUE",
    labelEn: "Revenue",
    labelAr: "الإيرادات",
    statementType: "INCOME_STATEMENT",
    description: "Total operating revenue / sales for the period",
    aliases: [
      "revenue", "revenues", "sales", "net sales", "gross sales", "operating revenue",
      "total revenue", "revenue from contracts with customers",
      "إيرادات نشاط الأعمال", "الإيرادات", "إجمالي الإيرادات", "المبيعات", "صافي المبيعات", "إيرادات التشغيل",
    ],
  },
  {
    code: "COGS",
    labelEn: "Cost of Sales",
    labelAr: "تكلفة المبيعات",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "cost of sales", "cost of revenue", "cost of goods sold", "cogs",
      "تكلفة المبيعات", "تكلفة الإيرادات", "تكلفة البضاعة المباعة",
    ],
  },
  {
    code: "GROSS_PROFIT",
    labelEn: "Gross Profit",
    labelAr: "إجمالي الربح",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "gross profit", "gross income",
      "إجمالي الربح", "الربح الإجمالي",
    ],
  },
  {
    code: "OPERATING_INCOME",
    labelEn: "Operating Profit",
    labelAr: "الربح التشغيلي",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "operating profit", "operating income", "profit from operations", "operating result",
      "الربح التشغيلي", "الربح من العمليات", "أرباح التشغيل",
    ],
  },
  {
    code: "NET_INTEREST_INCOME",
    labelEn: "Net Interest Income",
    labelAr: "صافي دخل الفوائد",
    statementType: "INCOME_STATEMENT",
    description: "Bank-specific metric",
    aliases: [
      "net interest income", "interest income net",
      "صافي دخل الفوائد", "صافي إيرادات الفوائد", "صافي الفوائد",
    ],
    appliesToSectors: ["Banks", "Financial Services"],
  },
  {
    code: "NET_PROFIT",
    labelEn: "Net Profit",
    labelAr: "صافي الربح",
    statementType: "INCOME_STATEMENT",
    description: "Net profit (loss) for the period after tax. May be negative.",
    aliases: [
      "net profit", "net income", "profit for the period", "net profit after tax",
      "profit (loss) for the period", "net profit (loss)", "loss for the period",
      "صافي الربح", "صافي الربح بعد الضريبة", "صافي أرباح الفترة", "صافي خسارة الفترة", "صافي الربح (الخسارة)",
    ],
  },
  {
    code: "EPS",
    labelEn: "Earnings Per Share",
    labelAr: "ربحية السهم",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "earnings per share", "basic earnings per share", "eps", "profit per share",
      "ربحية السهم", "ربح السهم", "أرباح السهم",
    ],
  },
  // ---------- BALANCE SHEET ----------
  {
    code: "TOTAL_ASSETS",
    labelEn: "Total Assets",
    labelAr: "إجمالي الأصول",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total assets", "assets", "total assets (including off-balance)",
      "إجمالي الأصول", "مجموع الأصول", "الأصول",
    ],
  },
  {
    code: "TOTAL_LIABILITIES",
    labelEn: "Total Liabilities",
    labelAr: "إجمالي الالتزامات",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total liabilities", "liabilities", "total equity and liabilities",
      "إجمالي الالتزامات", "مجموع الالتزامات", "الالتزامات",
    ],
  },
  {
    code: "TOTAL_EQUITY",
    labelEn: "Shareholders' Equity",
    labelAr: "حقوق الملكية",
    statementType: "BALANCE_SHEET",
    aliases: [
      "shareholders equity", "total equity", "owners equity", "stockholders equity",
      "equity attributable to shareholders", "total shareholders equity",
      "حقوق الملكية", "إجمالي حقوق الملكية", "حقوق مساهمي الشركة",
    ],
  },
  {
    code: "TOTAL_DEBT",
    labelEn: "Total Debt",
    labelAr: "إجمالي الدين",
    statementType: "BALANCE_SHEET",
    description: "Interest-bearing borrowings (loans + bonds)",
    aliases: [
      "total debt", "borrowings", "loans and borrowings", "interest bearing loans",
      "total borrowings", "debt",
      "إجمالي الدين", "إجمالي الاقتراضات", "القروض", "الاقتراضات",
    ],
  },
  {
    code: "DEPOSITS",
    labelEn: "Customer Deposits",
    labelAr: "ودائع العملاء",
    statementType: "BALANCE_SHEET",
    description: "Bank-specific metric",
    aliases: ["deposits", "customer deposits", "الودائع", "ودائع العملاء"],
    appliesToSectors: ["Banks"],
  },
  {
    code: "LOANS_NET",
    labelEn: "Loans (Net)",
    labelAr: "صافي القروض",
    statementType: "BALANCE_SHEET",
    description: "Bank-specific metric",
    aliases: ["loans net", "net loans", "loans and advances to customers", "صافي القروض", "القروض للعملاء"],
    appliesToSectors: ["Banks"],
  },
  // ---------- CASH FLOW ----------
  {
    code: "OPERATING_CASH_FLOW",
    labelEn: "Operating Cash Flow",
    labelAr: "التدفق النقدي التشغيلي",
    statementType: "CASH_FLOW",
    description: "Net cash generated from / used in operating activities. May be negative.",
    aliases: [
      "net cash from operating activities", "net cash generated from operating activities",
      "operating cash flow", "cash flows from operating activities",
      "net cash provided by operating activities",
      "صافي التدفقات النقدية من الأنشطة التشغيلية", "التدفق النقدي التشغيلي", "صافي النقد من الأنشطة التشغيلية",
    ],
  },
  {
    code: "INVESTING_CASH_FLOW",
    labelEn: "Investing Cash Flow",
    labelAr: "التدفق النقدي الاستثماري",
    statementType: "CASH_FLOW",
    aliases: [
      "net cash used in investing activities", "net cash from investing activities", "investing cash flow",
      "صافي التدفقات النقدية من الأنشطة الاستثمارية", "التدفق النقدي الاستثماري",
    ],
  },
  {
    code: "FINANCING_CASH_FLOW",
    labelEn: "Financing Cash Flow",
    labelAr: "التدفق النقدي التمويلي",
    statementType: "CASH_FLOW",
    aliases: [
      "net cash from financing activities", "financing cash flow",
      "صافي التدفقات النقدية من الأنشطة التمويلية", "التدفق النقدي التمويلي",
    ],
  },
]

// ---------- Calculated (derived) metrics ----------
// Derived values are NEVER stored in FinancialValue — only in CalculatedMetric,
// always with a formula version so old calculations remain auditable.

export interface CalculatedMetricDef {
  code: string
  labelEn: string
  labelAr: string
  formulaVersion: string
  kind: "growth" | "margin" | "ratio" | "passthrough" | "market"
  unit: "PERCENT" | "EGP" | "EGP_PER_SHARE" | "RATIO"
  requires?: string[] // raw metric inputs
  sectorSpecific?: boolean
  description?: string
}

export const CALC_METRICS: CalculatedMetricDef[] = [
  { code: "revenue_growth", labelEn: "Revenue Growth (YoY)", labelAr: "نمو الإيرادات", formulaVersion: "revenue_growth@1", kind: "growth", unit: "PERCENT", requires: ["REVENUE"], description: "(current - previous) / |previous| x 100, same-period basis" },
  { code: "profit_growth", labelEn: "Profit Growth (YoY)", labelAr: "نمو صافي الربح", formulaVersion: "profit_growth@1", kind: "growth", unit: "PERCENT", requires: ["NET_PROFIT"], description: "Not computed across sign transitions — see loss/profit transition events" },
  { code: "ocf_growth", labelEn: "Operating Cash Flow Growth", labelAr: "نمو التدفق النقدي التشغيلي", formulaVersion: "ocf_growth@1", kind: "growth", unit: "PERCENT", requires: ["OPERATING_CASH_FLOW"] },
  { code: "debt_growth", labelEn: "Debt Growth", labelAr: "نمو الدين", formulaVersion: "debt_growth@1", kind: "growth", unit: "PERCENT", requires: ["TOTAL_DEBT"] },
  { code: "equity_growth", labelEn: "Equity Growth", labelAr: "نمو حقوق الملكية", formulaVersion: "equity_growth@1", kind: "growth", unit: "PERCENT", requires: ["TOTAL_EQUITY"] },
  { code: "gross_margin", labelEn: "Gross Margin", labelAr: "هامش الربح الإجمالي", formulaVersion: "gross_margin@1", kind: "margin", unit: "PERCENT", requires: ["GROSS_PROFIT", "REVENUE"] },
  { code: "operating_margin", labelEn: "Operating Margin", labelAr: "هامش التشغيل", formulaVersion: "operating_margin@1", kind: "margin", unit: "PERCENT", requires: ["OPERATING_INCOME", "REVENUE"] },
  { code: "net_margin", labelEn: "Net Margin", labelAr: "هامش صافي الربح", formulaVersion: "net_margin@1", kind: "margin", unit: "PERCENT", requires: ["NET_PROFIT", "REVENUE"] },
  { code: "roe", labelEn: "Return on Equity (ROE)", labelAr: "العائد على حقوق الملكية", formulaVersion: "roe@1", kind: "ratio", unit: "PERCENT", requires: ["NET_PROFIT", "TOTAL_EQUITY"], description: "Net profit / period-end equity x 100" },
  { code: "roa", labelEn: "Return on Assets (ROA)", labelAr: "العائد على الأصول", formulaVersion: "roa@1", kind: "ratio", unit: "PERCENT", requires: ["NET_PROFIT", "TOTAL_ASSETS"] },
  { code: "debt_to_equity", labelEn: "Debt / Equity", labelAr: "الدين إلى حقوق الملكية", formulaVersion: "debt_to_equity@1", kind: "ratio", unit: "RATIO", requires: ["TOTAL_DEBT", "TOTAL_EQUITY"] },
  { code: "eps", labelEn: "EPS", labelAr: "ربحية السهم", formulaVersion: "eps@1", kind: "ratio", unit: "EGP_PER_SHARE", requires: ["NET_PROFIT"] },
  // passthroughs (make scanner conditions possible on absolute values)
  { code: "revenue", labelEn: "Revenue", labelAr: "الإيرادات", formulaVersion: "revenue@1", kind: "passthrough", unit: "EGP", requires: ["REVENUE"] },
  { code: "net_profit", labelEn: "Net Profit", labelAr: "صافي الربح", formulaVersion: "net_profit@1", kind: "passthrough", unit: "EGP", requires: ["NET_PROFIT"] },
  { code: "operating_cash_flow", labelEn: "Operating Cash Flow", labelAr: "التدفق النقدي التشغيلي", formulaVersion: "operating_cash_flow@1", kind: "passthrough", unit: "EGP", requires: ["OPERATING_CASH_FLOW"] },
  { code: "total_assets", labelEn: "Total Assets", labelAr: "إجمالي الأصول", formulaVersion: "total_assets@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_ASSETS"] },
  { code: "total_equity", labelEn: "Shareholders' Equity", labelAr: "حقوق الملكية", formulaVersion: "total_equity@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_EQUITY"] },
  { code: "total_debt", labelEn: "Total Debt", labelAr: "إجمالي الدين", formulaVersion: "total_debt@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_DEBT"] },
  // market-dependent — require market price data which is NOT connected.
  // These must report DATA_UNAVAILABLE, never fabricated values.
  { code: "p_b", labelEn: "Price / Book (P/B)", labelAr: "السعر إلى القيمة الدفترية", formulaVersion: "p_b@1", kind: "market", unit: "RATIO", description: "Requires market price and book value per share" },
  { code: "p_e", labelEn: "Price / Earnings (P/E)", labelAr: "السعر إلى الأرباح", formulaVersion: "p_e@1", kind: "market", unit: "RATIO", description: "Requires market price and EPS" },
  { code: "market_cap", labelEn: "Market Capitalization", labelAr: "القيمة السوقية", formulaVersion: "market_cap@1", kind: "market", unit: "EGP", description: "Requires market price and shares outstanding" },
  { code: "dividend_yield", labelEn: "Dividend Yield", labelAr: "عائد التوزيعات", formulaVersion: "dividend_yield@1", kind: "market", unit: "PERCENT", description: "Requires market price" },
]

export const CALC_METRIC_MAP: Record<string, CalculatedMetricDef> = Object.fromEntries(
  CALC_METRICS.map((m) => [m.code, m])
)

export const RAW_METRIC_MAP: Record<string, RawMetricDef> = Object.fromEntries(
  RAW_METRICS.map((m) => [m.code, m])
)

// ---------- Event type definitions ----------
export interface EventTypeDef {
  type: string
  labelEn: string
  labelAr: string
  tone: "positive" | "negative" | "neutral"
  description: string
}

export const EVENT_TYPES: EventTypeDef[] = [
  { type: "LOSS_TO_PROFIT", labelEn: "Loss → Profit (Turnaround)", labelAr: "تحول من خسارة إلى ربح", tone: "positive", description: "Company moved from net loss to net profit" },
  { type: "PROFIT_TO_LOSS", labelEn: "Profit → Loss (Deterioration)", labelAr: "تحول من ربح إلى خسارة", tone: "negative", description: "Company moved from net profit to net loss" },
  { type: "PROFIT_ACCELERATION", labelEn: "Accelerating Profit Growth", labelAr: "تسارع نمو الأرباح", tone: "positive", description: "Profit growth is positive and increasing for two consecutive periods" },
  { type: "REVENUE_GROWTH", labelEn: "Strong Revenue Growth", labelAr: "نمو قوي للإيرادات", tone: "positive", description: "Revenue growth ≥ 15% (same-period basis)" },
  { type: "DEBT_REDUCTION", labelEn: "Debt Reduction", labelAr: "خفض الدين", tone: "positive", description: "Total debt decreased ≥ 5%" },
  { type: "EQUITY_GROWTH", labelEn: "Equity Growth", labelAr: "نمو حقوق الملكية", tone: "positive", description: "Shareholders' equity increased ≥ 10%" },
  { type: "CASH_FLOW_IMPROVEMENT", labelEn: "Cash Flow Improvement", labelAr: "تحسن التدفق النقدي", tone: "positive", description: "Operating cash flow turned positive or improved ≥ 20%" },
  { type: "FINANCIAL_RECOVERY", labelEn: "Financial Recovery Pattern", labelAr: "نمط تعافي مالي", tone: "positive", description: "Loss→Profit AND revenue growth ≥ 10% AND positive operating cash flow AND debt not increasing" },
  { type: "FINANCIAL_DETERIORATION", labelEn: "Financial Deterioration Pattern", labelAr: "نمط تدهور مالي", tone: "negative", description: "Profit→Loss combined with revenue decline and/or negative operating cash flow" },
  { type: "STRONG_PROFITABILITY", labelEn: "Strong Profitability (ROE)", labelAr: "ربحية قوية", tone: "positive", description: "ROE ≥ 15%" },
  { type: "HIGH_ASSETS", labelEn: "High Total Assets", labelAr: "أصول كبيرة", tone: "neutral", description: "Total assets ≥ EGP 10 billion" },
]

export const EVENT_TYPE_MAP: Record<string, EventTypeDef> = Object.fromEntries(
  EVENT_TYPES.map((e) => [e.type, e])
)

// Sector list (industry-specific logic — banks get bank metrics, etc.)
export const SECTORS = [
  "Banks",
  "Real Estate",
  "Industrial",
  "Telecom",
  "Healthcare",
  "Food",
  "Investment",
  "Financial Services",
  "Consumer",
  "Other",
] as const
