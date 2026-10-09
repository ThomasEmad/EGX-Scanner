// Pre-built research questions — 16 ready answers grounded in metric values.
import type { AnalysisContext } from "./types"
import { formatPercent, formatValue, findLatestValue, findPriorYearValue } from "./types"

export interface ResearchQuestion {
  id: string
  question: string
  questionAr?: string
  answer: string
  answerAr?: string
  metricCodes: string[]
}

export function answerResearchQuestions(ctx: AnalysisContext): ResearchQuestion[] {
  const out: ResearchQuestion[] = []
  const latest = ctx.periods[ctx.periods.length - 1]
  if (!latest) {
    return [{ id: "no-data", question: "Are financial statements available?", answer: "No — no periods are loaded for this company.", metricCodes: [] }]
  }
  const np = latest.values["NET_PROFIT"]
  const revenue = latest.values["REVENUE"]
  const ocf = latest.values["OPERATING_CASH_FLOW"]
  const totalAssets = latest.values["TOTAL_ASSETS"]
  const totalEquity = latest.values["TOTAL_EQUITY"]
  const totalDebt = latest.values["TOTAL_DEBT"]
  const eps = latest.values["EPS"]
  const shares = latest.values["SHARES_OUTSTANDING"]
  const opIncome = latest.values["OPERATING_INCOME"]
  const currentRatio = latest.values["CURRENT_ASSETS"] && latest.values["CURRENT_LIABILITIES"]
    ? latest.values["CURRENT_ASSETS"] / latest.values["CURRENT_LIABILITIES"]
    : undefined
  const priorNp = findPriorYearValue(ctx, "NET_PROFIT")
  const priorRev = findPriorYearValue(ctx, "REVENUE")

  // 1. Is the company profitable?
  out.push({
    id: "q1-profitable",
    question: "Is the company profitable in the latest period?",
    questionAr: "هل الشركة تحقق ربحًا في الفترة الأخيرة؟",
    answer: np === undefined ? "Unknown — net profit not available."
      : np > 0 ? `Yes — net profit of ${formatValue(np)} in ${latest.periodLabel}.`
      : `No — net loss of ${formatValue(Math.abs(np))} in ${latest.periodLabel}.`,
    metricCodes: ["NET_PROFIT"],
  })
  // 2. What is the revenue growth?
  if (priorRev && revenue !== undefined && priorRev.value > 0) {
    const g = ((revenue - priorRev.value) / Math.abs(priorRev.value)) * 100
    out.push({
      id: "q2-revenue-growth",
      question: "How fast is revenue growing year-over-year?",
      questionAr: "ما معدل نمو الإيرادات سنويًا؟",
      answer: `Revenue grew ${formatPercent(g, { sign: true })} YoY (${formatValue(priorRev.value)} → ${formatValue(revenue)}).`,
      metricCodes: ["REVENUE"],
    })
  }
  // 3. What is the net margin?
  if (np !== undefined && revenue !== undefined && revenue !== 0) {
    out.push({
      id: "q3-net-margin",
      question: "What is the net margin?",
      questionAr: "ما هامش صافي الربح؟",
      answer: `Net margin is ${formatPercent((np / revenue) * 100)} (${formatValue(np)} on ${formatValue(revenue)} revenue).`,
      metricCodes: ["NET_PROFIT", "REVENUE"],
    })
  }
  // 4. What is the ROE?
  if (np !== undefined && totalEquity !== undefined && totalEquity !== 0) {
    out.push({
      id: "q4-roe",
      question: "What is the return on equity?",
      questionAr: "ما العائد على حقوق الملكية؟",
      answer: `ROE is ${formatPercent((np / totalEquity) * 100)} on equity of ${formatValue(totalEquity)}.`,
      metricCodes: ["NET_PROFIT", "TOTAL_EQUITY"],
    })
  }
  // 5. What is the debt-to-equity ratio?
  if (totalDebt !== undefined && totalEquity !== undefined && totalEquity !== 0) {
    out.push({
      id: "q5-de",
      question: "What is the debt-to-equity ratio?",
      questionAr: "ما نسبة الدين إلى حقوق الملكية؟",
      answer: `Debt/Equity is ${(totalDebt / totalEquity).toFixed(2)}x (debt ${formatValue(totalDebt)} / equity ${formatValue(totalEquity)}).`,
      metricCodes: ["TOTAL_DEBT", "TOTAL_EQUITY"],
    })
  }
  // 6. What is the EPS?
  if (eps !== undefined) {
    out.push({
      id: "q6-eps",
      question: "What are earnings per share?",
      questionAr: "ما هي ربحية السهم؟",
      answer: `EPS is ${eps.toFixed(2)} EGP per share for ${latest.periodLabel}.`,
      metricCodes: ["EPS"],
    })
  } else if (np !== undefined && shares !== undefined && shares > 0) {
    out.push({
      id: "q6-eps-computed",
      question: "What are earnings per share?",
      questionAr: "ما هي ربحية السهم؟",
      answer: `EPS (computed) is ${(np / shares).toFixed(2)} EGP per share (${formatValue(np)} on ${formatValue(shares)} shares).`,
      metricCodes: ["NET_PROFIT", "SHARES_OUTSTANDING"],
    })
  }
  // 7. Is operating cash flow positive?
  out.push({
    id: "q7-ocf-positive",
    question: "Is operating cash flow positive?",
    questionAr: "هل التدفق النقدي التشغيلي إيجابي؟",
    answer: ocf === undefined ? "Unknown — operating cash flow not disclosed."
      : ocf > 0 ? `Yes — operating cash flow is ${formatValue(ocf)} (positive).`
      : `No — operating cash flow is ${formatValue(ocf)} (negative).`,
    metricCodes: ["OPERATING_CASH_FLOW"],
  })
  // 8. Are earnings backed by cash?
  if (np !== undefined && ocf !== undefined && np > 0) {
    const r = ocf / np
    out.push({
      id: "q8-cash-backed",
      question: "Are earnings backed by cash?",
      questionAr: "هل الأرباح مدعومة بالتدفق النقدي؟",
      answer: `CFO/Net income = ${r.toFixed(2)}x — ${r > 0.8 ? "earnings are well-backed by cash" : r > 0.5 ? "moderate cash backing" : "low cash backing (accrual-heavy)"}.`,
      metricCodes: ["OPERATING_CASH_FLOW", "NET_PROFIT"],
    })
  }
  // 9. Is the company highly leveraged?
  if (totalDebt !== undefined && totalEquity !== undefined) {
    const de = totalEquity !== 0 ? totalDebt / totalEquity : null
    out.push({
      id: "q9-leverage",
      question: "Is the company highly leveraged?",
      questionAr: "هل الشركة مرفوعة ماليًا بشكل كبير؟",
      answer: de === null ? "Cannot assess — equity is zero."
        : de > 2 ? `Yes — D/E ${de.toFixed(2)}x indicates high leverage.`
        : de > 1 ? `Moderate — D/E ${de.toFixed(2)}x.`
        : `No — D/E ${de.toFixed(2)}x is manageable.`,
      metricCodes: ["TOTAL_DEBT", "TOTAL_EQUITY"],
    })
  }
  // 10. What is the current ratio?
  if (currentRatio !== undefined) {
    out.push({
      id: "q10-current-ratio",
      question: "What is the current ratio?",
      questionAr: "ما نسبة التداول؟",
      answer: `Current ratio is ${currentRatio.toFixed(2)}x — ${currentRatio < 1 ? "below 1, short-term liquidity stress" : currentRatio < 1.5 ? "adequate but tight" : "comfortable liquidity"}.`,
      metricCodes: ["CURRENT_ASSETS", "CURRENT_LIABILITIES"],
    })
  }
  // 11. Did net profit grow YoY?
  if (priorNp && np !== undefined && priorNp.value > 0) {
    const g = ((np - priorNp.value) / Math.abs(priorNp.value)) * 100
    out.push({
      id: "q11-profit-growth",
      question: "Did net profit grow year-over-year?",
      questionAr: "هل نمت الأرباح سنويًا؟",
      answer: `Net profit ${g > 0 ? "grew" : "declined"} ${formatPercent(Math.abs(g))} YoY (${formatValue(priorNp.value)} → ${formatValue(np)}).`,
      metricCodes: ["NET_PROFIT"],
    })
  }
  // 12. What is the operating margin?
  if (opIncome !== undefined && revenue !== undefined && revenue !== 0) {
    out.push({
      id: "q12-operating-margin",
      question: "What is the operating margin?",
      questionAr: "ما هامش التشغيل؟",
      answer: `Operating margin is ${formatPercent((opIncome / revenue) * 100)} (${formatValue(opIncome)} on ${formatValue(revenue)} revenue).`,
      metricCodes: ["OPERATING_INCOME", "REVENUE"],
    })
  }
  // 13. What is ROA?
  if (np !== undefined && totalAssets !== undefined && totalAssets !== 0) {
    out.push({
      id: "q13-roa",
      question: "What is the return on assets?",
      questionAr: "ما العائد على الأصول؟",
      answer: `ROA is ${formatPercent((np / totalAssets) * 100)} on assets of ${formatValue(totalAssets)}.`,
      metricCodes: ["NET_PROFIT", "TOTAL_ASSETS"],
    })
  }
  // 14. What is the asset size?
  if (totalAssets !== undefined) {
    out.push({
      id: "q14-assets-size",
      question: "How large is the company by total assets?",
      questionAr: "ما حجم الشركة حسب إجمالي الأصول؟",
      answer: `Total assets are ${formatValue(totalAssets)} as of ${latest.periodLabel}.`,
      metricCodes: ["TOTAL_ASSETS"],
    })
  }
  // 15. What is the equity book value?
  if (totalEquity !== undefined && shares !== undefined && shares > 0) {
    out.push({
      id: "q15-bvps",
      question: "What is the book value per share?",
      questionAr: "ما هي القيمة الدفترية للسهم؟",
      answer: `Book value per share is ${(totalEquity / shares).toFixed(2)} EGP (${formatValue(totalEquity)} / ${formatValue(shares)} shares).`,
      metricCodes: ["TOTAL_EQUITY", "SHARES_OUTSTANDING"],
    })
  }
  // 16. Summary recommendation
  const positiveSignals = [
    np !== undefined && np > 0,
    ocf !== undefined && ocf > 0,
    revenue !== undefined && priorRev !== undefined && priorRev !== null && revenue > priorRev.value,
    np !== undefined && priorNp !== undefined && priorNp !== null && np > priorNp.value,
    totalDebt !== undefined && totalEquity !== undefined && (totalEquity === 0 ? false : totalDebt / totalEquity < 1),
  ].filter(Boolean).length
  out.push({
    id: "q16-summary",
    question: "Overall financial health summary?",
    questionAr: "ملخص الصحة المالية العامة؟",
    answer: `${positiveSignals}/5 positive signals detected (profitability, cash flow, revenue growth, profit growth, manageable leverage).`,
    metricCodes: ["NET_PROFIT", "OPERATING_CASH_FLOW", "REVENUE", "TOTAL_DEBT", "TOTAL_EQUITY"],
  })
  return out
}
