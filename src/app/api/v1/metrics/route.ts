import { CALC_METRICS, RAW_METRICS, EVENT_TYPES } from "@/lib/financial/registry"
import { cachedResponse } from "@/lib/public-cache"

// GET /api/v1/metrics — the metric registry (normalization dictionary) + calculated
// metric definitions + event types. Used by the custom scanner builder.
// Static registry content — cached in-process (1h) so scanner-builder traffic
// never touches the registry module at scale.
export async function GET() {
  return cachedResponse("metrics-registry", 60 * 60 * 1000, async () => ({
    rawMetrics: RAW_METRICS,
    calculatedMetrics: CALC_METRICS.filter((m) => m.kind !== "market"),
    marketMetrics: CALC_METRICS.filter((m) => m.kind === "market"),
    eventTypes: EVENT_TYPES,
  }))
}
