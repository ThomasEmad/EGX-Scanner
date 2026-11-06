// Anomaly detection — flags outliers vs expected patterns.
import type { AnalysisResult, AnalysisContext, EvidenceStatement } from "./types"
import { insufficientDataStatement } from "./types"
import { anomalyStatement } from "./narrative"

export function anomalyDetectionAnalysis(ctx: AnalysisContext): AnalysisResult {
  const statements: EvidenceStatement[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return {
      category: "anomaly_detection",
      title: "Anomaly Detection",
      summary: "Insufficient data.",
      statements: [insufficientDataStatement("anomaly_detection", ["REVENUE", "NET_PROFIT", "OPERATING_CASH_FLOW"])],
      assessment: "UNKNOWN",
    }
  }
  const np = latest.values["NET_PROFIT"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  // CFO / NP divergence: NP >> CFO suggests accrual heavy
  if (np !== undefined && ocf !== undefined && np > 0) {
    const ratio = ocf / np
    if (ratio < 0.3) {
      statements.push(anomalyStatement({
        label: "Cash flow vs earnings divergence",
        metricCode: "OPERATING_CASH_FLOW",
        value: ocf,
        expected: np,
        periodKey: latest.periodKey,
        severity: "warning",
      }))
    }
  }
  // Revenue vs receivables growth divergence
  const revenue = latest.values["REVENUE"]
  const receivables = latest.values["TRADE_RECEIVABLES"] ?? latest.values["ACCOUNTS_RECEIVABLE"]
  const prior = ctx.periods.length >= 2 ? ctx.periods[ctx.periods.length - 2] : undefined
  if (prior && revenue !== undefined && receivables !== undefined && prior.values.REVENUE && prior.values.TRADE_RECEIVABLES) {
    const revGrowth = (revenue - prior.values.REVENUE) / Math.abs(prior.values.REVENUE) * 100
    const recGrowth = (receivables - prior.values.TRADE_RECEIVABLES) / Math.abs(prior.values.TRADE_RECEIVABLES) * 100
    if (recGrowth > revGrowth + 30) {
      statements.push(anomalyStatement({
        label: "Receivables growing faster than revenue",
        metricCode: "TRADE_RECEIVABLES",
        value: recGrowth,
        expected: revGrowth,
        periodKey: latest.periodKey,
        severity: "warning",
      }))
    }
  }
  // Negative equity flag
  const equity = latest.values["TOTAL_EQUITY"]
  if (equity !== undefined && equity < 0) {
    statements.push({
      id: "anomaly-negative-equity",
      label: "Negative shareholders' equity",
      narrative: `Total equity is negative (${equity.toExponential(2)}) — the company owes more than it owns.`,
      metricCodes: ["TOTAL_EQUITY"],
      periodKeys: [latest.periodKey],
      sources: [{ metricCode: "TOTAL_EQUITY", periodKey: latest.periodKey, value: equity }],
      tone: "warning",
      confidence: 0.95,
      tags: ["anomaly", "negative_equity"],
    })
  }
  // Net profit sign flip
  if (prior && np !== undefined && prior.values.NET_PROFIT !== undefined) {
    const prevNp = prior.values.NET_PROFIT
    if (prevNp > 0 && np < 0) {
      statements.push({
        id: "anomaly-profit-loss-flip",
        label: "Profit → Loss transition",
        narrative: `Net profit moved from a profit of ${prevNp.toExponential(2)} to a loss of ${Math.abs(np).toExponential(2)}.`,
        metricCodes: ["NET_PROFIT"],
        periodKeys: [latest.periodKey, prior.periodKey],
        sources: [
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
          { metricCode: "NET_PROFIT", periodKey: prior.periodKey, value: prevNp },
        ],
        tone: "negative",
        confidence: 0.95,
        tags: ["anomaly", "profit_to_loss"],
      })
    } else if (prevNp < 0 && np > 0) {
      statements.push({
        id: "anomaly-loss-profit-flip",
        label: "Loss → Profit transition",
        narrative: `Net profit moved from a loss of ${Math.abs(prevNp).toExponential(2)} to a profit of ${np.toExponential(2)}.`,
        metricCodes: ["NET_PROFIT"],
        periodKeys: [latest.periodKey, prior.periodKey],
        sources: [
          { metricCode: "NET_PROFIT", periodKey: latest.periodKey, value: np },
          { metricCode: "NET_PROFIT", periodKey: prior.periodKey, value: prevNp },
        ],
        tone: "positive",
        confidence: 0.95,
        tags: ["anomaly", "loss_to_profit"],
      })
    }
  }
  if (statements.length === 0) {
    return {
      category: "anomaly_detection",
      title: "Anomaly Detection",
      summary: "No anomalies detected in the latest period.",
      statements: [{
        id: "anomaly-none",
        label: "No anomalies detected",
        narrative: "No accounting anomalies were detected across the evaluated metrics.",
        metricCodes: [],
        periodKeys: [latest.periodKey],
        sources: [],
        tone: "positive",
        confidence: 0.7,
        tags: ["anomaly_detection"],
      }],
      assessment: "STRONG",
      periodKey: latest.periodKey,
    }
  }
  return {
    category: "anomaly_detection",
    title: "Anomaly Detection",
    summary: `${statements.length} anomaly/anomalies detected in the latest period.`,
    statements,
    assessment: "WEAK",
    periodKey: latest.periodKey,
  }
}
