// Ontology barrel — re-exports the extended ontology layer.
//
// The ontology layer is additive — it extends the existing RawMetricDef with
// spec-required attributes (period type, fact classification, investor
// relevance, source preference, fact graph edges, sector applicability)
// without breaking the existing registry or requiring DB migrations.
//
// Modules in src/lib/financial/ontology/:
//   - fact-classification.ts — REPORTED / CALCULATED / GUIDANCE / FORECAST / etc.
//   - metric-period-types.ts — FLOW / STOCK / POINT_IN_TIME / RATIO / etc.
//   - investor-relevance.ts — CRITICAL / HIGH / MEDIUM / LOW + source preference
//   - sector-applicability.ts — sector-specific metric sets + suppressed ratios
//   - fact-graph.ts — total → breakdown relationships

export * from "./fact-classification"
export * from "./metric-period-types"
export * from "./investor-relevance"
export * from "./sector-applicability"
export * from "./fact-graph"
