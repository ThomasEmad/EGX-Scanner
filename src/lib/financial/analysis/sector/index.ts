// Sector overlay module — dispatches to sector-specific analysis based on the
// company's industry classification.
//
// Spec section 12 requires sector-aware ontologies for:
//   Banks, Real Estate, Industrial / Manufacturing, Telecom / Technology,
//   Healthcare, Investment / Financial Services, Consumer / Food, Energy / Utilities.
//
// The dispatcher uses heuristic string matching on the industry label.
// Returns null when no sector overlay applies (company falls through to
// generic analysis only).

import type { AnalysisContext, AnalysisResult } from "../types"
import { banksAnalysis } from "./banks"
import { realEstateAnalysis } from "./real-estate"
import { industrialAnalysis } from "./industrial"
import { investmentHoldingAnalysis } from "./investment-holding"
import { telecomAnalysis } from "./telecom"
import { healthcareAnalysis } from "./healthcare"
import { consumerFoodAnalysis } from "./consumer-food"
import { energyUtilitiesAnalysis } from "./energy-utilities"

export function sectorOverlayAnalysis(ctx: AnalysisContext): AnalysisResult | null {
  const sector = ctx.sector
  if (!sector) return null
  const normalized = sector.toLowerCase()
  if (normalized.includes("bank")) return banksAnalysis(ctx)
  if (normalized.includes("real estate") || normalized.includes("real_estate") || normalized.includes("realestate")) return realEstateAnalysis(ctx)
  if (normalized.includes("industrial") || normalized.includes("manufacturing")) return industrialAnalysis(ctx)
  if (normalized.includes("telecom") || normalized.includes("technology") || normalized.includes("tech")) return telecomAnalysis(ctx)
  if (normalized.includes("health") || normalized.includes("pharma") || normalized.includes("medical")) return healthcareAnalysis(ctx)
  if (normalized.includes("food") || normalized.includes("beverage") || normalized.includes("consumer") || normalized.includes("fmcg")) return consumerFoodAnalysis(ctx)
  if (normalized.includes("energy") || normalized.includes("utilit") || normalized.includes("power") || normalized.includes("oil") || normalized.includes("gas") || normalized.includes("petro")) return energyUtilitiesAnalysis(ctx)
  if (normalized.includes("investment") || normalized.includes("holding") || normalized.includes("financial services")) return investmentHoldingAnalysis(ctx)
  return null
}

/** Export sector analyzers individually so the dispatcher / benchmark
 *  harness can call them directly. */
export {
  banksAnalysis,
  realEstateAnalysis,
  industrialAnalysis,
  investmentHoldingAnalysis,
  telecomAnalysis,
  healthcareAnalysis,
  consumerFoodAnalysis,
  energyUtilitiesAnalysis,
}
