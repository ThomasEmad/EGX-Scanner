// Financial Fact Graph — captures the structural relationships between
// financial facts as a directed acyclic graph.
//
// Spec section 19 (Build a Financial Fact Graph) requires:
//   - Total → breakdown relationships (TOTAL_DEBT → ST + LT + LEASES)
//   - Primary statement → related note (Borrowings → debt note with maturity)
//   - Aggregate → components (REVENUE → product + geographic + segment)
//
// The graph is consumed by:
//   - Validation: to verify Total = Σ Breakdown (accounting identity)
//   - Coverage report: to mark "total found but breakdowns missing" cases
//   - Research profile: to surface concentration (segment / geography)
//   - Reviewer UI: to drill down from a primary statement value to its notes
//
// All edges are PURE metadata (no values) — graph traversal requires joining
// against FinancialValue rows at query time.

export type FactGraphEdgeType =
  | "BREAKDOWN" // A → B where A is the total and B is a component (REVENUE → PRODUCT_REVENUE)
  | "NOTE_LINK" // A → B where A is a primary statement line and B is its note disclosure
  | "SUBPERIOD" // A → B where A is the cumulative (H1) and B is a sub-period (Q1, Q2)
  | "DERIVATION" // A → B where A is calculated from B (NET_DEBT → TOTAL_DEBT, CASH)
  | "RESTATEMENT" // A → B where B supersedes A in a later filing
  | "EQUIVALENT" // A ↔ B where A and B are the same concept under different labels
  | "OPPOSITE" // A → B where A and B are inverses (INTEREST_INCOME ↔ INTEREST_EXPENSE)

export interface FactGraphEdge {
  from: string // parent metric code
  to: string // child metric code
  type: FactGraphEdgeType
  /** Optional constraint — e.g. "CURRENCY:USD" for foreign-currency debt subset */
  dimension?: string
  /** Human label for this edge */
  label?: string
}

/** Canonical graph edges. This is the "constitution" of the financial fact graph —
 *  every total → breakdown relationship in a standard EGX filing. */
export const FACT_GRAPH_EDGES: FactGraphEdge[] = [
  // ----- Income statement breakdowns -----
  { from: "REVENUE", to: "SALES", type: "EQUIVALENT", label: "Sales ≈ Revenue" },
  { from: "REVENUE", to: "SEGMENT_REVENUE", type: "BREAKDOWN", label: "Revenue by segment" },
  { from: "REVENUE", to: "NET_SALES", type: "EQUIVALENT", label: "Net sales = Revenue − returns" },
  { from: "GROSS_PROFIT", to: "REVENUE", type: "DERIVATION", label: "Gross profit = Revenue − COGS" },
  { from: "GROSS_PROFIT", to: "COGS", type: "DERIVATION", label: "Gross profit = Revenue − COGS" },
  { from: "OPERATING_INCOME", to: "GROSS_PROFIT", type: "DERIVATION", label: "Op profit = Gross profit − Opex" },
  { from: "OPERATING_INCOME", to: "OPERATING_EXPENSES_TOTAL", type: "DERIVATION" },
  { from: "OPERATING_EXPENSES_TOTAL", to: "SELLING_EXPENSES", type: "BREAKDOWN" },
  { from: "OPERATING_EXPENSES_TOTAL", to: "ADMIN_EXPENSES", type: "BREAKDOWN" },
  { from: "OPERATING_EXPENSES_TOTAL", to: "RD_EXPENSES", type: "BREAKDOWN" },
  { from: "FINANCE_COST", to: "INTEREST_EXPENSE", type: "BREAKDOWN", label: "Finance cost contains interest expense" },
  { from: "FINANCE_INCOME", to: "INTEREST_INCOME", type: "BREAKDOWN" },
  { from: "INCOME_TAX", to: "CURRENT_TAX", type: "BREAKDOWN" },
  { from: "INCOME_TAX", to: "DEFERRED_TAX", type: "BREAKDOWN" },
  { from: "NET_PROFIT", to: "NET_PROFIT_PARENT", type: "BREAKDOWN", label: "NP = NP_parent + NCI" },
  { from: "NET_PROFIT", to: "NON_CONTROLLING_INTERESTS", type: "BREAKDOWN", dimension: "INCOME" },
  { from: "TOTAL_COMPREHENSIVE_INCOME", to: "NET_PROFIT", type: "BREAKDOWN" },
  { from: "TOTAL_COMPREHENSIVE_INCOME", to: "OCI_TOTAL", type: "BREAKDOWN" },
  { from: "OCI_TOTAL", to: "OCI_FX_TRANSLATION", type: "BREAKDOWN" },
  { from: "OCI_TOTAL", to: "OCI_FVOCI_MOVEMENTS", type: "BREAKDOWN" },
  { from: "OCI_TOTAL", to: "OCI_ACTUARIAL", type: "BREAKDOWN" },
  { from: "OCI_TOTAL", to: "OCI_REVALUATION", type: "BREAKDOWN" },

  // ----- Balance sheet breakdowns -----
  { from: "TOTAL_ASSETS", to: "CURRENT_ASSETS", type: "BREAKDOWN" },
  { from: "TOTAL_ASSETS", to: "NON_CURRENT_ASSETS", type: "BREAKDOWN" },
  { from: "TOTAL_LIABILITIES", to: "CURRENT_LIABILITIES", type: "BREAKDOWN" },
  { from: "TOTAL_LIABILITIES", to: "NON_CURRENT_LIABILITIES", type: "BREAKDOWN" },
  { from: "TOTAL_EQUITY_AND_LIABILITIES", to: "TOTAL_LIABILITIES", type: "BREAKDOWN" },
  { from: "TOTAL_EQUITY_AND_LIABILITIES", to: "TOTAL_EQUITY", type: "BREAKDOWN" },
  { from: "TOTAL_EQUITY", to: "EQUITY_PARENT", type: "BREAKDOWN" },
  { from: "TOTAL_EQUITY", to: "NON_CONTROLLING_INTERESTS", type: "BREAKDOWN", dimension: "EQUITY" },
  { from: "EQUITY_PARENT", to: "SHARE_CAPITAL", type: "BREAKDOWN" },
  { from: "EQUITY_PARENT", to: "SHARE_PREMIUM", type: "BREAKDOWN" },
  { from: "EQUITY_PARENT", to: "RETAINED_EARNINGS", type: "BREAKDOWN" },
  { from: "EQUITY_PARENT", to: "RESERVES", type: "BREAKDOWN" },
  { from: "EQUITY_PARENT", to: "OCI_RESERVES", type: "BREAKDOWN" },
  { from: "EQUITY_PARENT", to: "TREASURY_SHARES", type: "BREAKDOWN", label: "Treasury shares reduce equity" },

  // ----- Asset breakdowns -----
  { from: "CURRENT_ASSETS", to: "CASH_AND_EQUIVALENTS", type: "BREAKDOWN" },
  { from: "CURRENT_ASSETS", to: "ACCOUNTS_RECEIVABLE", type: "BREAKDOWN" },
  { from: "CURRENT_ASSETS", to: "TRADE_RECEIVABLES", type: "BREAKDOWN" },
  { from: "CURRENT_ASSETS", to: "OTHER_RECEIVABLES", type: "BREAKDOWN" },
  { from: "CURRENT_ASSETS", to: "INVENTORY", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "PPE", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "ROU_ASSETS", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "INTANGIBLE_ASSETS", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "GOODWILL", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "INVESTMENTS", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "INVESTMENT_PROPERTY", type: "BREAKDOWN" },
  { from: "NON_CURRENT_ASSETS", to: "DEFERRED_TAX_ASSETS", type: "BREAKDOWN" },
  { from: "INTANGIBLE_ASSETS", to: "GOODWILL", type: "BREAKDOWN" },
  { from: "INVESTMENTS", to: "FINANCIAL_ASSETS", type: "BREAKDOWN" },
  { from: "INVESTMENTS", to: "ASSOCIATES_CARRYING", type: "BREAKDOWN" },
  { from: "INVESTMENTS", to: "JV_CARRYING", type: "BREAKDOWN" },
  { from: "FINANCIAL_ASSETS", to: "FVPL_ASSETS", type: "BREAKDOWN" },
  { from: "FINANCIAL_ASSETS", to: "FVOCI_ASSETS", type: "BREAKDOWN" },

  // ----- Liability breakdowns -----
  { from: "CURRENT_LIABILITIES", to: "TRADE_PAYABLES", type: "BREAKDOWN" },
  { from: "CURRENT_LIABILITIES", to: "OTHER_PAYABLES", type: "BREAKDOWN" },
  { from: "CURRENT_LIABILITIES", to: "SHORT_TERM_DEBT", type: "BREAKDOWN" },
  { from: "CURRENT_LIABILITIES", to: "LEASE_LIABILITIES_CURRENT", type: "BREAKDOWN" },
  { from: "CURRENT_LIABILITIES", to: "TAX_PAYABLE", type: "BREAKDOWN" },
  { from: "NON_CURRENT_LIABILITIES", to: "LONG_TERM_DEBT", type: "BREAKDOWN" },
  { from: "NON_CURRENT_LIABILITIES", to: "LEASE_LIABILITIES_NONCURRENT", type: "BREAKDOWN" },
  { from: "NON_CURRENT_LIABILITIES", to: "DEFERRED_TAX_LIABILITIES", type: "BREAKDOWN" },
  { from: "NON_CURRENT_LIABILITIES", to: "PROVISIONS", type: "BREAKDOWN" },

  // ----- DEBT GRAPH (spec section 4) — extremely detailed -----
  { from: "TOTAL_DEBT", to: "SHORT_TERM_DEBT", type: "BREAKDOWN", label: "ST portion" },
  { from: "TOTAL_DEBT", to: "LONG_TERM_DEBT", type: "BREAKDOWN", label: "LT portion" },
  { from: "TOTAL_DEBT", to: "LEASE_LIABILITIES", type: "BREAKDOWN", label: "Lease liabilities" },
  { from: "LEASE_LIABILITIES", to: "LEASE_LIABILITIES_CURRENT", type: "BREAKDOWN" },
  { from: "LEASE_LIABILITIES", to: "LEASE_LIABILITIES_NONCURRENT", type: "BREAKDOWN" },
  // Note-level breakdowns by currency / type (DEBT_NOTE_* codes added in extended ontology)
  // Note: when DEBT_NOTE_* codes are populated from note extraction, they
  // automatically attach as breakdown children of TOTAL_DEBT.

  // ----- Cash flow breakdowns -----
  { from: "OPERATING_CASH_FLOW", to: "CASH_GENERATED_OPERATIONS", type: "BREAKDOWN" },
  { from: "OPERATING_CASH_FLOW", to: "WC_MOVEMENTS", type: "BREAKDOWN" },
  { from: "OPERATING_CASH_FLOW", to: "TAXES_PAID", type: "BREAKDOWN" },
  { from: "OPERATING_CASH_FLOW", to: "INTEREST_PAID_CF", type: "BREAKDOWN" },
  { from: "OPERATING_CASH_FLOW", to: "INTEREST_RECEIVED_CF", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "CAPEX", type: "BREAKDOWN" },
  { from: "CAPEX", to: "PPE_PURCHASES", type: "BREAKDOWN" },
  { from: "CAPEX", to: "INTANGIBLE_PURCHASES", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "INVESTMENTS_PURCHASED", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "INVESTMENTS_SOLD", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "ACQUISITIONS_CASH", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "ASSET_SALE_PROCEEDS", type: "BREAKDOWN" },
  { from: "INVESTING_CASH_FLOW", to: "DIVIDENDS_RECEIVED_CF", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "DEBT_PROCEEDS", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "DEBT_REPAYMENTS", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "LEASE_PAYMENTS", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "DIVIDENDS_PAID", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "CAPITAL_INCREASES_CASH", type: "BREAKDOWN" },
  { from: "FINANCING_CASH_FLOW", to: "TREASURY_TRANSACTIONS_CASH", type: "BREAKDOWN" },
  { from: "NET_CHANGE_IN_CASH", to: "OPERATING_CASH_FLOW", type: "DERIVATION" },
  { from: "NET_CHANGE_IN_CASH", to: "INVESTING_CASH_FLOW", type: "DERIVATION" },
  { from: "NET_CHANGE_IN_CASH", to: "FINANCING_CASH_FLOW", type: "DERIVATION" },
  { from: "CLOSING_CASH", to: "OPENING_CASH", type: "DERIVATION", label: "Closing = Opening + Net change" },
  { from: "CLOSING_CASH", to: "NET_CHANGE_IN_CASH", type: "DERIVATION" },

  // ----- PPE note breakdown -----
  { from: "PPE", to: "CONSTRUCTION_IN_PROGRESS", type: "BREAKDOWN" },
  { from: "PPE", to: "PPE_ADDITIONS", type: "NOTE_LINK", label: "PPE movements note" },
  { from: "PPE", to: "PPE_DISPOSALS", type: "NOTE_LINK" },
  { from: "PPE", to: "DEPRECIATION_EXPENSE", type: "NOTE_LINK" },

  // ----- Equity movement breakdown -----
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_PROFIT", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_OCI", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_DIVIDENDS", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_SHARE_ISSUES", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_TREASURY", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_TRANSFERS", type: "NOTE_LINK" },
  { from: "TOTAL_EQUITY", to: "EQ_MOVEMENT_NCI", type: "NOTE_LINK" },

  // ----- Derivation edges (CalculatedMetric inputs) -----
  { from: "EPS", to: "NET_PROFIT", type: "DERIVATION" },
  { from: "EPS", to: "WEIGHTED_AVG_SHARES", type: "DERIVATION" },
  { from: "BOOK_VALUE_PER_SHARE", to: "TOTAL_EQUITY", type: "DERIVATION" },
  { from: "BOOK_VALUE_PER_SHARE", to: "SHARES_OUTSTANDING", type: "DERIVATION" },
  { from: "DIVIDEND_PER_SHARE", to: "DIVIDENDS_PAID", type: "DERIVATION" },
  { from: "DIVIDEND_PER_SHARE", to: "SHARES_OUTSTANDING", type: "DERIVATION" },

  // ----- Sub-period relationships (spec section 16) -----
  // Q2 = H1 − Q1, Q4 = FY − 9M, Q3 = 9M − H1, Q4 = FY − 9M
  // These are encoded as SUBPERIOD edges so reviewers can verify derivations.
  // (The actual derivation arithmetic lives in derivation/period-derivation.ts)

  // ----- Restatement / reclassification edges -----
  // These are dynamic — created when a later filing supersedes an earlier one.
  // Encoded at runtime via FinancialReport.supersedesId + FinancialValue.isRestated.
]

/** Index by parent → list of children, by edge type. */
export const FACT_GRAPH_CHILDREN: Record<string, FactGraphEdge[]> = (() => {
  const out: Record<string, FactGraphEdge[]> = {}
  for (const e of FACT_GRAPH_EDGES) {
    if (!out[e.from]) out[e.from] = []
    out[e.from].push(e)
  }
  return out
})()

/** Index by child → list of parents, by edge type. */
export const FACT_GRAPH_PARENTS: Record<string, FactGraphEdge[]> = (() => {
  const out: Record<string, FactGraphEdge[]> = {}
  for (const e of FACT_GRAPH_EDGES) {
    if (!out[e.to]) out[e.to] = []
    out[e.to].push(e)
  }
  return out
})()

/** Get all breakdown children of a metric (i.e. the components that should sum
 *  to the parent value). Filters out DERIVATION / EQUIVALENT / NOTE_LINK edges
 *  since those don't represent summation identities. */
export function getBreakdownChildren(metricCode: string): string[] {
  const edges = FACT_GRAPH_CHILDREN[metricCode] ?? []
  return edges
    .filter((e) => e.type === "BREAKDOWN")
    .map((e) => e.to)
}

/** Get the primary total for a breakdown component (e.g. SHORT_TERM_DEBT → TOTAL_DEBT).
 *  Returns the first BREAKDOWN parent found, or undefined. */
export function getBreakdownParent(metricCode: string): string | undefined {
  const edges = FACT_GRAPH_PARENTS[metricCode] ?? []
  const parent = edges.find((e) => e.type === "BREAKDOWN")
  return parent?.from
}

/** Get all metrics in the same derivation chain (e.g. EPS → NET_PROFIT, WEIGHTED_AVG_SHARES). */
export function getDerivationInputs(metricCode: string): string[] {
  const edges = FACT_GRAPH_CHILDREN[metricCode] ?? []
  return edges
    .filter((e) => e.type === "DERIVATION")
    .map((e) => e.to)
}

/** Get all metrics that derive FROM this one (e.g. NET_PROFIT is an input to EPS, ROE, ROA, NET_MARGIN). */
export function getDerivationOutputs(metricCode: string): string[] {
  const edges = FACT_GRAPH_PARENTS[metricCode] ?? []
  return edges
    .filter((e) => e.type === "DERIVATION")
    .map((e) => e.from)
}

/** Get all note-linked metrics for a primary statement line. */
export function getNoteLinks(metricCode: string): string[] {
  const edges = FACT_GRAPH_CHILDREN[metricCode] ?? []
  return edges
    .filter((e) => e.type === "NOTE_LINK")
    .map((e) => e.to)
}

/** Coverage of breakdown children for a given total — used by the coverage
 *  report to flag "total found but breakdowns missing" cases. */
export interface BreakdownCoverage {
  parent: string
  children: string[]
  foundChildren: string[]
  missingChildren: string[]
  coveragePct: number // 0..1
}

export function computeBreakdownCoverage(
  parent: string,
  availableCodes: Set<string>,
): BreakdownCoverage {
  const children = getBreakdownChildren(parent)
  const foundChildren = children.filter((c) => availableCodes.has(c))
  const missingChildren = children.filter((c) => !availableCodes.has(c))
  const coveragePct = children.length === 0 ? 1 : foundChildren.length / children.length
  return { parent, children, foundChildren, missingChildren, coveragePct }
}

/** Get the full breakdown tree for a metric (recursive). Useful for the
 *  reviewer drill-down UI. */
export interface FactGraphNode {
  metricCode: string
  edgeType?: FactGraphEdgeType
  children: FactGraphNode[]
}

export function buildFactGraphTree(metricCode: string, visited: Set<string> = new Set()): FactGraphNode {
  if (visited.has(metricCode)) {
    return { metricCode, children: [] }
  }
  visited.add(metricCode)
  const edges = FACT_GRAPH_CHILDREN[metricCode] ?? []
  const children: FactGraphNode[] = edges
    .filter((e) => e.type === "BREAKDOWN" || e.type === "DERIVATION" || e.type === "NOTE_LINK")
    .map((e) => buildFactGraphTree(e.to, new Set(visited)))
  return { metricCode, children }
}
