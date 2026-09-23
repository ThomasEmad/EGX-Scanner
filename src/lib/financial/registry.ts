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
  /** Per-share values (EPS, DPS, book value/share) are NEVER multiplied by the report unit scale */
  isPerShare?: boolean
  /** Share counts are NEVER multiplied by the report unit scale either */
  isCount?: boolean
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
    isPerShare: true,
    aliases: [
      "earnings per share", "basic earnings per share", "eps", "profit per share",
      "ربحية السهم", "ربح السهم", "أرباح السهم",
    ],
  },
  {
    code: "PROFIT_BEFORE_TAX",
    labelEn: "Profit Before Tax",
    labelAr: "الربح قبل الضريبة",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "profit before tax", "profit before income tax", "income before tax", "pre-tax profit",
      "الربح قبل الضريبة", "الأرباح قبل الضريبة", "الربح قبل خصم الضريبة",
    ],
  },
  {
    code: "INCOME_TAX",
    labelEn: "Income Tax Expense",
    labelAr: "مصروف ضريبة الدخل",
    statementType: "INCOME_STATEMENT",
    aliases: [
      "income tax expense", "income tax", "tax expense", "income tax charge",
      "مصروف ضريبة الدخل", "ضريبة الدخل", "الضريبة على الدخل", "مصروف الضريبة",
    ],
  },
  {
    code: "FINANCE_COST",
    labelEn: "Finance Cost",
    labelAr: "تكاليف التمويل",
    statementType: "INCOME_STATEMENT",
    description: "Finance costs / interest expense for non-bank companies",
    aliases: [
      "finance cost", "finance costs", "interest expense", "net finance cost", "financing costs",
      "تكاليف التمويل", "تكلفة التمويل", "مصروفات التمويل", "مصروف الفوائد", "الفوائد المدفوعة",
    ],
  },
  {
    code: "NET_PROFIT_PARENT",
    labelEn: "Net Profit Attributable to Parent",
    labelAr: "صافي الربح المخصص لحقوق مساهمي الشركة الأم",
    statementType: "INCOME_STATEMENT",
    description: "Portion of net profit attributable to owners of the parent company",
    aliases: [
      "net profit attributable to shareholders of the parent", "net profit attributable to owners of the parent",
      "net profit attributable to equity holders of the parent", "profit attributable to shareholders of the parent company",
      "net profit attributable to the parent",
      "صافي الربح المخصص لحقوق مساهمي الشركة الأم", "الربح المخصص لمساهمي الشركة الأم", "صافي الربح المخصص للشركة الأم",
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
      "total liabilities", "liabilities",
      "إجمالي الالتزامات", "مجموع الالتزامات", "الالتزامات",
    ],
  },
  {
    code: "TOTAL_EQUITY_AND_LIABILITIES",
    labelEn: "Total Equity and Liabilities",
    labelAr: "إجمالي حقوق الملكية والالتزامات",
    statementType: "BALANCE_SHEET",
    description: "Should equal total assets — used as a cross-check",
    aliases: [
      "total equity and liabilities", "total liabilities and equity", "total liabilities and shareholders equity",
      "إجمالي حقوق الملكية والالتزامات", "إجمالي الالتزامات وحقوق الملكية",
    ],
  },
  {
    code: "TOTAL_EQUITY",
    labelEn: "Total Shareholders' Equity",
    labelAr: "إجمالي حقوق الملكية",
    statementType: "BALANCE_SHEET",
    description: "Total equity including non-controlling interests when reported",
    aliases: [
      "total equity", "shareholders equity", "owners equity", "stockholders equity",
      "total shareholders equity", "total owners equity",
      "إجمالي حقوق الملكية", "حقوق الملكية", "حقوق مساهمي الشركة", "إجمالي حقوق المساهمين",
    ],
  },
  {
    code: "EQUITY_PARENT",
    labelEn: "Equity Attributable to Parent",
    labelAr: "حقوق ملكية مساهمي الشركة الأم",
    statementType: "BALANCE_SHEET",
    aliases: [
      "equity attributable to owners of the parent", "equity attributable to shareholders of the parent",
      "equity attributable to equity holders of the parent", "equity attributable to the parent company",
      "حقوق ملكية مساهمي الشركة الأم", "حقوق مساهمي الشركة الأم", "حقوق الملكية المخصصة للشركة الأم",
    ],
  },
  {
    code: "NON_CONTROLLING_INTERESTS",
    labelEn: "Non-Controlling Interests",
    labelAr: "حقوق غير المسيطرة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "non controlling interests", "noncontrolling interests", "minority interests", "non controlling interests equity",
      "حقوق غير المسيطرة", "حصص غير المسيطرة", "حقوق غير المساهمين المسيطرين",
    ],
  },
  {
    code: "CURRENT_ASSETS",
    labelEn: "Total Current Assets",
    labelAr: "إجمالي الأصول المتداولة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total current assets", "current assets",
      "إجمالي الأصول المتداولة", "الأصول المتداولة", "إجمالي الأصول الحالية", "الأصول الحالية",
    ],
  },
  {
    code: "NON_CURRENT_ASSETS",
    labelEn: "Total Non-Current Assets",
    labelAr: "إجمالي الأصول غير المتداولة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total non current assets", "non current assets", "total noncurrent assets",
      "إجمالي الأصول غير المتداولة", "الأصول غير المتداولة",
    ],
  },
  {
    code: "CURRENT_LIABILITIES",
    labelEn: "Total Current Liabilities",
    labelAr: "إجمالي الالتزامات المتداولة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total current liabilities", "current liabilities",
      "إجمالي الالتزامات المتداولة", "الالتزامات المتداولة", "إجمالي الالتزامات الحالية", "الالتزامات الحالية",
    ],
  },
  {
    code: "NON_CURRENT_LIABILITIES",
    labelEn: "Total Non-Current Liabilities",
    labelAr: "إجمالي الالتزامات غير المتداولة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "total non current liabilities", "non current liabilities",
      "إجمالي الالتزامات غير المتداولة", "الالتزامات غير المتداولة",
    ],
  },
  {
    code: "CASH_AND_EQUIVALENTS",
    labelEn: "Cash and Cash Equivalents",
    labelAr: "النقد وما في حكمه",
    statementType: "BALANCE_SHEET",
    aliases: [
      "cash and cash equivalents", "cash and equivalents", "cash at banks and on hand",
      "النقد وما في حكمه", "النقد وما يعادله", "النقدية وما في حكمها",
    ],
  },
  {
    code: "ACCOUNTS_RECEIVABLE",
    labelEn: "Trade & Other Receivables",
    labelAr: "الذمم المدينة وأخرى",
    statementType: "BALANCE_SHEET",
    aliases: [
      "trade and other receivables", "trade receivables", "accounts receivable", "receivables",
      "الذمم المدينة وأخرى", "الذمم المدينة", "المدينون", "المدينون وغيرهم المدينين",
    ],
  },
  {
    code: "INVENTORY",
    labelEn: "Inventories",
    labelAr: "المخزون",
    statementType: "BALANCE_SHEET",
    aliases: [
      "inventories", "inventory", "المخزون", "المخزونات",
    ],
  },
  {
    code: "INVESTMENTS",
    labelEn: "Investments",
    labelAr: "الاستثمارات",
    statementType: "BALANCE_SHEET",
    description: "Long-term and/or short-term investments as presented",
    aliases: [
      "investments", "investments in associates", "investments in securities",
      "الاستثمارات", "الاستثمارات في الشركات الزميلة", "الاستثمارات طويلة الأجل",
    ],
  },
  {
    code: "SHORT_TERM_DEBT",
    labelEn: "Short-Term Borrowings",
    labelAr: "الاقتراضات قصيرة الأجل",
    statementType: "BALANCE_SHEET",
    aliases: [
      "short term borrowings", "short-term borrowings", "short term loans", "current portion of borrowings",
      "short term debt", "bank overdrafts and short term loans",
      "الاقتراضات قصيرة الأجل", "القروض قصيرة الأجل", "اقتراضات قصيرة الأجل",
    ],
  },
  {
    code: "LONG_TERM_DEBT",
    labelEn: "Long-Term Borrowings",
    labelAr: "الاقتراضات طويلة الأجل",
    statementType: "BALANCE_SHEET",
    aliases: [
      "long term borrowings", "long-term borrowings", "long term loans", "long term debt",
      "الاقتراضات طويلة الأجل", "القروض طويلة الأجل", "اقتراضات طويلة الأجل",
    ],
  },
  {
    code: "RETAINED_EARNINGS",
    labelEn: "Retained Earnings",
    labelAr: "الأرباح المبقاة",
    statementType: "BALANCE_SHEET",
    aliases: [
      "retained earnings", "retained profits", "الأرباح المبقاة", "الأرباح المحتجزة",
    ],
  },
  {
    code: "SHARES_OUTSTANDING",
    labelEn: "Number of Shares Outstanding",
    labelAr: "عدد الأسهم",
    statementType: "BALANCE_SHEET",
    description: "Share count — a COUNT, never scaled by the report unit",
    isCount: true,
    aliases: [
      "number of shares outstanding", "shares outstanding", "weighted average number of shares outstanding",
      "issued shares", "number of issued shares",
      "عدد الأسهم", "عدد الأسهم المصدرة", "العدد المرجح لعدد الأسهم القائمة",
    ],
  },
  {
    code: "BOOK_VALUE_PER_SHARE",
    labelEn: "Book Value Per Share",
    labelAr: "القيمة الدفترية للسهم",
    statementType: "OTHER",
    isPerShare: true,
    aliases: [
      "book value per share", "القيمة الدفترية للسهم", "القيمة الدفترية لكل سهم",
    ],
  },
  {
    code: "DIVIDEND_PER_SHARE",
    labelEn: "Dividend Per Share",
    labelAr: "التوزيع النقدي للسهم",
    statementType: "OTHER",
    isPerShare: true,
    aliases: [
      "dividend per share", "proposed dividend per share", "cash dividend per share",
      "التوزيع النقدي للسهم", "توزيعات السهم", "حصة السهم من التوزيعات",
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
  {
    code: "NET_CHANGE_IN_CASH",
    labelEn: "Net Change in Cash",
    labelAr: "صافي التغير في النقد",
    statementType: "CASH_FLOW",
    aliases: [
      "net increase in cash and cash equivalents", "net decrease in cash and cash equivalents",
      "net change in cash", "net increase decrease in cash",
      "صافي الزيادة نقصان النقد وما في حكمه", "صافي التغير في النقد وما في حكمه", "صافي التغير في النقد",
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
  { code: "current_ratio", labelEn: "Current Ratio", labelAr: "نسبة التداول", formulaVersion: "current_ratio@1", kind: "ratio", unit: "RATIO", requires: ["CURRENT_ASSETS", "CURRENT_LIABILITIES"], description: "Current assets / current liabilities — liquidity" },
  { code: "eps_growth", labelEn: "EPS Growth (YoY)", labelAr: "نمو ربحية السهم", formulaVersion: "eps_growth@1", kind: "growth", unit: "PERCENT", requires: ["EPS"] },
  { code: "asset_growth", labelEn: "Asset Growth", labelAr: "نمو الأصول", formulaVersion: "asset_growth@1", kind: "growth", unit: "PERCENT", requires: ["TOTAL_ASSETS"] },
  { code: "book_value_per_share", labelEn: "Book Value Per Share", labelAr: "القيمة الدفترية للسهم", formulaVersion: "book_value_per_share@1", kind: "ratio", unit: "EGP_PER_SHARE", requires: ["TOTAL_EQUITY"], description: "Total equity / shares outstanding (report-level share count preferred, else company-level)" },
  // passthroughs (make scanner conditions possible on absolute values)
  { code: "revenue", labelEn: "Revenue", labelAr: "الإيرادات", formulaVersion: "revenue@1", kind: "passthrough", unit: "EGP", requires: ["REVENUE"] },
  { code: "net_profit", labelEn: "Net Profit", labelAr: "صافي الربح", formulaVersion: "net_profit@1", kind: "passthrough", unit: "EGP", requires: ["NET_PROFIT"] },
  { code: "operating_cash_flow", labelEn: "Operating Cash Flow", labelAr: "التدفق النقدي التشغيلي", formulaVersion: "operating_cash_flow@1", kind: "passthrough", unit: "EGP", requires: ["OPERATING_CASH_FLOW"] },
  { code: "total_assets", labelEn: "Total Assets", labelAr: "إجمالي الأصول", formulaVersion: "total_assets@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_ASSETS"] },
  { code: "total_equity", labelEn: "Shareholders' Equity", labelAr: "حقوق الملكية", formulaVersion: "total_equity@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_EQUITY"] },
  { code: "total_debt", labelEn: "Total Debt", labelAr: "إجمالي الدين", formulaVersion: "total_debt@1", kind: "passthrough", unit: "EGP", requires: ["TOTAL_DEBT"] },
  // market-dependent — computed when a market price point exists (MarketPrice row).
  // Without any price they report DATA_UNAVAILABLE — never fabricated.
  { code: "p_b", labelEn: "Price / Book (P/B)", labelAr: "السعر إلى القيمة الدفترية", formulaVersion: "p_b@2", kind: "market", unit: "RATIO", description: "Market cap / shareholders' equity; requires a market price point and positive book value" },
  { code: "p_e", labelEn: "Price / Earnings (P/E)", labelAr: "السعر إلى الأرباح", formulaVersion: "p_e@2", kind: "market", unit: "RATIO", description: "Price / EPS of the evaluated period; NOT_APPLICABLE when earnings are negative" },
  { code: "market_cap", labelEn: "Market Capitalization", labelAr: "القيمة السوقية", formulaVersion: "market_cap@2", kind: "market", unit: "EGP", description: "Price x shares outstanding; requires a market price point" },
  { code: "dividend_yield", labelEn: "Dividend Yield", labelAr: "عائد التوزيعات", formulaVersion: "dividend_yield@2", kind: "market", unit: "PERCENT", description: "Trailing-12-month dividends per share / price; requires a market price point" },
]

/** Metrics whose values must NEVER be scaled by the report unit (EPS, DPS, BVPS are EGP/share; shares are counts) */
export function isUnitlessMetric(code: string): boolean {
  const def = RAW_METRIC_MAP[code]
  return !!(def && (def.isPerShare || def.isCount))
}

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
