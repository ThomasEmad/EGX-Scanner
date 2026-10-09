// Research profile — aggregator that runs every analysis module and composes
// a comprehensive research report on a company.
import type { AnalysisContext, AnalysisResult } from "./types"
import { earningsQualityAnalysis } from "./earnings-quality"
import { profitabilityDecomposition } from "./profitability-decomposition"
import { cashFlowQualityAnalysis } from "./cash-flow-quality"
import { balanceSheetQualityAnalysis } from "./balance-sheet-quality"
import { workingCapitalAnalysis } from "./working-capital"
import { capitalAllocationAnalysis } from "./capital-allocation"
import { debtIntelligenceAnalysis } from "./debt-intelligence"
import { returnsAnalysis } from "./returns-analysis"
import { historicalTrendsAnalysis } from "./historical-trends"
import { anomalyDetectionAnalysis } from "./anomaly-detection"
import { restatementIntelligenceAnalysis } from "./restatement-intelligence"
import { revenueQualityAnalysis } from "./revenue-quality"
import { segmentIntelligenceAnalysis } from "./segment-intelligence"
import { sectorOverlayAnalysis } from "./sector"

export interface ResearchProfile {
  companyId: string
  anchorPeriodKey: string | undefined
  categories: AnalysisResult[]
  assessment: "STRONG" | "HEALTHY" | "ADEQUATE" | "WEAK" | "UNKNOWN"
  statementCount: number
  summary: string
  generatedAt: string
}

export function buildResearchProfile(ctx: AnalysisContext): ResearchProfile {
  const categories: AnalysisResult[] = [
    earningsQualityAnalysis(ctx),
    profitabilityDecomposition(ctx),
    cashFlowQualityAnalysis(ctx),
    balanceSheetQualityAnalysis(ctx),
    workingCapitalAnalysis(ctx),
    capitalAllocationAnalysis(ctx),
    debtIntelligenceAnalysis(ctx),
    returnsAnalysis(ctx),
    historicalTrendsAnalysis(ctx),
    anomalyDetectionAnalysis(ctx),
    restatementIntelligenceAnalysis(ctx),
    revenueQualityAnalysis(ctx),
    segmentIntelligenceAnalysis(ctx),
  ]
  // Sector overlay if applicable
  const sectorOverlay = sectorOverlayAnalysis(ctx)
  if (sectorOverlay) categories.push(sectorOverlay)
  // Aggregate assessment
  const assessments = categories.map((c) => c.assessment ?? "UNKNOWN")
  let strong = 0, healthy = 0, adequate = 0, weak = 0, unknown = 0
  for (const a of assessments) {
    if (a === "STRONG") strong++
    else if (a === "HEALTHY") healthy++
    else if (a === "ADEQUATE") adequate++
    else if (a === "WEAK") weak++
    else unknown++
  }
  let overall: ResearchProfile["assessment"] = "UNKNOWN"
  if (strong + healthy >= 6) overall = "STRONG"
  else if (strong + healthy + adequate >= 6) overall = "HEALTHY"
  else if (weak >= 4) overall = "WEAK"
  else if (adequate + weak >= 4) overall = "ADEQUATE"
  const statementCount = categories.reduce((acc, c) => acc + c.statements.length, 0)
  return {
    companyId: ctx.companyId,
    anchorPeriodKey: ctx.anchorPeriodKey ?? (ctx.periods[ctx.periods.length - 1]?.periodKey),
    categories,
    assessment: overall,
    statementCount,
    summary: `${categories.length} analysis categories produced ${statementCount} grounded statements. Overall: ${overall}.`,
    generatedAt: new Date().toISOString(),
  }
}
