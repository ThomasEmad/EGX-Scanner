import { CALC_METRICS, RAW_METRICS, EVENT_TYPES } from "@/lib/financial/registry"

// GET /api/v1/metrics — the metric registry (normalization dictionary) + calculated
// metric definitions + event types. Used by the custom scanner builder.
export async function GET() {
  return Response.json({
    rawMetrics: RAW_METRICS,
    calculatedMetrics: CALC_METRICS.filter((m) => m.kind !== "market"),
    marketMetrics: CALC_METRICS.filter((m) => m.kind === "market"),
    eventTypes: EVENT_TYPES,
  })
}
