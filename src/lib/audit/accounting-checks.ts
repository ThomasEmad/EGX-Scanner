// CATEGORY 1: Accounting Identity Violations
// Balance sheet equation, income statement logic, cash flow reconciliation,
// retained-earnings roll-forward, asset/liability component identities.
//
// Precision rules (v2):
//  • Every identity is tested against BOTH a relative tolerance and an absolute
//    materiality floor, relative to the natural scale of the statement — never
//    relative to the small delta itself.
//  • Minority interest (NON_CONTROLLING_INTERESTS) explains part of A = L + E;
//    FX effect on cash (FX_EFFECT_CASH) explains part of the cash-flow identity.
//    When the disclosed line explains the gap, it is not an error.
//  • Immaterial gaps are advisory; only material contradictions are blockers.

import type { AuditCheckResult, AuditSeverity } from "./types"
import { materiality, identitySeverity, type MaterialityResult } from "./issue-class"

export interface BSPeriodValues {
  period: string
  TOTAL_ASSETS?: number
  TOTAL_LIABILITIES?: number
  TOTAL_EQUITY?: number
  TOTAL_EQUITY_AND_LIABILITIES?: number
  NON_CONTROLLING_INTERESTS?: number
  REVENUE?: number
  COGS?: number
  GROSS_PROFIT?: number
  OPERATING_INCOME?: number
  PROFIT_BEFORE_TAX?: number
  INCOME_TAX?: number
  NET_PROFIT?: number
  NET_PROFIT_PARENT?: number
  OPERATING_CASH_FLOW?: number
  INVESTING_CASH_FLOW?: number
  FINANCING_CASH_FLOW?: number
  FX_EFFECT_CASH?: number
  NET_CHANGE_IN_CASH?: number
  CLOSING_CASH?: number
  OPENING_CASH?: number
  CURRENT_ASSETS?: number
  NON_CURRENT_ASSETS?: number
  CURRENT_LIABILITIES?: number
  NON_CURRENT_LIABILITIES?: number
  SHORT_TERM_DEBT?: number
  LONG_TERM_DEBT?: number
  TOTAL_DEBT?: number
  DEPRECIATION_EXPENSE?: number
  DEPRECIATION_AMORTIZATION?: number
  EQ_MOVEMENT_PROFIT?: number
  EQ_MOVEMENT_OCI?: number
  EQ_MOVEMENT_DIVIDENDS?: number
  EQ_MOVEMENT_SHARE_ISSUES?: number
  RETAINED_EARNINGS?: number
}

const isFinancialSector = (sector?: string) =>
  sector === "Banks" || sector === "Financial Services" || sector === "Insurance" || sector === "Investment"

interface IdentityArgs {
  ticker: string
  period: string
  checkName: string
  actual: number
  expected: number
  base: number
  relTolerance: number
  fields: string[]
  rootCause: string
  /** Below this relative gap the finding is advisory (definitional/rounding),
   * above it a blocker. */
  advisoryRel?: number
  /** Human explanation appended to the message. */
  note?: string
}

function fmt(n: number): string {
  const a = Math.abs(n)
  if (a >= 1e9) return `${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`
  return n.toFixed(2)
}

function identityFinding(a: IdentityArgs): AuditCheckResult | null {
  const diff = a.actual - a.expected
  const m = materiality(diff, a.base, a.relTolerance)
  if (!m.material) return null

  const advisory = a.advisoryRel !== undefined && m.rel <= a.advisoryRel
  const severity: AuditSeverity = advisory ? "medium" : identitySeverity(m, { relTolerance: a.relTolerance })

  return {
    checkName: a.checkName,
    category: "accounting",
    severity,
    passed: false,
    ticker: a.ticker,
    period: a.period,
    currentValue: a.actual,
    expectedValue: a.expected,
    autoFixable: false,
    issueClass: advisory ? "advisory" : "blocker",
    rootCause: a.rootCause,
    materialityRel: m.rel,
    materialityAbs: m.abs,
    details:
      `${a.checkName} ${advisory ? "FLAG" : "FAILED"}: gap ${(m.rel * 100).toFixed(2)}% ` +
      `(${fmt(diff)} EGP; materiality threshold ${fmt(m.threshold)}) on [${a.fields.join(", ")}].` +
      (a.note ? ` ${a.note}` : ""),
    detailsAr:
      `${a.checkName} ${advisory ? "ملاحظة" : "فشل"}: فرق ${(m.rel * 100).toFixed(2)}% ` +
      `(${fmt(diff)} جنيه؛ حد الأهمية ${fmt(m.threshold)}) في [${a.fields.join(", ")}].` +
      (a.note ? ` ${a.note}` : ""),
  }
}

function materialityThreshold(base: number): number {
  return Math.max(base * 0.005, Math.min(1_000_000, base * 0.001))
}

/** CATEGORY 1 — run all accounting identity checks for one company. */
export function runAccountingChecks(ticker: string, periods: BSPeriodValues[], sector?: string): AuditCheckResult[] {
  const results: AuditCheckResult[] = []
  const financial = isFinancialSector(sector)

  for (const p of periods) {
    const period = p.period

    // 1.1 Balance sheet identity: A = L + E (+ NCI when equity excludes it)
    if (p.TOTAL_ASSETS !== undefined && p.TOTAL_LIABILITIES !== undefined && p.TOTAL_EQUITY !== undefined) {
      const base = Math.max(Math.abs(p.TOTAL_ASSETS), Math.abs(p.TOTAL_LIABILITIES), Math.abs(p.TOTAL_EQUITY))
      const threshold = materialityThreshold(base)
      const gap = p.TOTAL_ASSETS - (p.TOTAL_LIABILITIES + p.TOTAL_EQUITY)
      const nci = p.NON_CONTROLLING_INTERESTS
      const teal = p.TOTAL_EQUITY_AND_LIABILITIES
      const gapMaterial = Math.abs(gap) > threshold
      const nciExplains = nci !== undefined && Math.abs(Math.abs(gap) - Math.abs(nci)) <= threshold
      // A "total liabilities and equity" caption wrongly mapped into
      // TOTAL_LIABILITIES shows up as L ≈ total assets or L ≈ assets + equity.
      const liabilitiesEqualAssets = Math.abs(p.TOTAL_LIABILITIES - p.TOTAL_ASSETS) <= threshold
      const liabilitiesEqualTeal = teal !== undefined && Math.abs(p.TOTAL_LIABILITIES - teal) <= threshold
      const liabilitiesIncludeEquity =
        Math.abs(p.TOTAL_LIABILITIES - (p.TOTAL_ASSETS + p.TOTAL_EQUITY)) <= Math.max(base * 0.01, threshold)
      const misMappedLiabilities =
        liabilitiesEqualAssets || liabilitiesEqualTeal || liabilitiesIncludeEquity
      // The reported cross-check line agrees with assets, so the statement
      // balances at total level and only the L/E split is wrong.
      const tealMatchesAssets = teal !== undefined && Math.abs(teal - p.TOTAL_ASSETS) <= threshold

      if (!gapMaterial || nciExplains) {
        // The identity holds (directly or once NCI is taken into account).
        // A TEAL line that disagrees is a separate cross-check value and must
        // never override a statement that actually balances.
      } else if (misMappedLiabilities) {
        results.push({
          checkName: "BALANCE_SHEET_EQUATION",
          category: "accounting", severity: "high", passed: false,
          ticker, period,
          currentValue: p.TOTAL_LIABILITIES, expectedValue: p.TOTAL_ASSETS - p.TOTAL_EQUITY,
          autoFixable: false, issueClass: "blocker", rootCause: "BS_MAPPING",
          materialityRel: Math.abs(gap) / base, materialityAbs: Math.abs(gap),
          details: `BALANCE_SHEET_EQUATION MAPPING ERROR: TOTAL_LIABILITIES (${fmt(p.TOTAL_LIABILITIES)}) is calibrated like total equity & liabilities / total assets, not liabilities (expected ≈ ${fmt(p.TOTAL_ASSETS - p.TOTAL_EQUITY)}). Re-extract the liabilities line.`,
          detailsAr: `خطأ ربط: إجمالي الالتزامات (${fmt(p.TOTAL_LIABILITIES)}) يبدو أنه إجمالي الحقوق والالتزامات أو إجمالي الأصول وليس الالتزامات (المتوقع ≈ ${fmt(p.TOTAL_ASSETS - p.TOTAL_EQUITY)}). أعد استخراج بند الالتزامات.`,
        })
      } else if (tealMatchesAssets) {
        const rel = Math.abs(gap) / base
        const advisory = rel <= 0.05
        results.push({
          checkName: "BALANCE_SHEET_EQUATION",
          category: "accounting", severity: advisory ? "medium" : "high", passed: false,
          ticker, period,
          currentValue: p.TOTAL_ASSETS, expectedValue: p.TOTAL_LIABILITIES + p.TOTAL_EQUITY,
          autoFixable: false, issueClass: advisory ? "advisory" : "blocker", rootCause: advisory ? "BS_IDENTITY" : "BS_MAPPING",
          materialityRel: rel, materialityAbs: Math.abs(gap),
          details: advisory
            ? `BALANCE_SHEET_EQUATION FLAG: TOTAL_EQUITY_AND_LIABILITIES agrees with TOTAL_ASSETS (${fmt(p.TOTAL_ASSETS)}) but the L/E split leaves a ${fmt(gap)} gap (${(rel * 100).toFixed(2)}%) — usually undisclosed NCI or rounding.`
            : `BALANCE_SHEET_EQUATION MAPPING ERROR: TOTAL_EQUITY_AND_LIABILITIES agrees with TOTAL_ASSETS (${fmt(p.TOTAL_ASSETS)}) but the L/E split leaves a ${fmt(gap)} gap (${(rel * 100).toFixed(2)}%) — an equity or liability line is mis-mapped.`,
          detailsAr: advisory
            ? `ملاحظة: إجمالي الحقوق والالتزامات يطابق الأصول لكن تفصيل الالتزامات/الحقوق يترك فرقاً ${fmt(gap)} (${(rel * 100).toFixed(2)}%) — عادةً حقوق أقلية غير مفصح عنها أو تقريب.`
            : `خطأ ربط: إجمالي الحقوق والالتزامات يطابق إجمالي الأصول (${fmt(p.TOTAL_ASSETS)}) لكن تفصيل الالتزامات/الحقوق يترك فرقاً ${fmt(gap)} — أحد بنود الحقوق أو الالتزامات مرتبط خطأً.`,
        })
      } else {
        const r = identityFinding({
          ticker, period, checkName: "BALANCE_SHEET_EQUATION",
          actual: p.TOTAL_ASSETS, expected: p.TOTAL_LIABILITIES + p.TOTAL_EQUITY,
          base, relTolerance: 0.005,
          fields: ["TOTAL_ASSETS", "TOTAL_LIABILITIES", "TOTAL_EQUITY"],
          rootCause: "BS_IDENTITY", advisoryRel: 0.05,
          note: nci !== undefined
            ? `Disclosed NCI (${fmt(nci)}) does not fully explain the gap.`
            : "Possible non-controlling interest or a total-liabilities mapping issue.",
        })
        if (r) results.push(r)
      }
    }

    // 1.2 GROSS_PROFIT = REVENUE - |COGS| (materiality vs revenue scale)
    if (p.REVENUE !== undefined && p.COGS !== undefined && p.GROSS_PROFIT !== undefined) {
      const expected = p.REVENUE - Math.abs(p.COGS)
      const base = Math.max(Math.abs(p.REVENUE), Math.abs(p.COGS), Math.abs(p.GROSS_PROFIT))
      const diff = p.GROSS_PROFIT - expected
      const m = materiality(diff, base, 0.02)
      const signInverted =
        Math.sign(expected) !== 0 &&
        Math.sign(p.GROSS_PROFIT) !== 0 &&
        Math.sign(expected) !== Math.sign(p.GROSS_PROFIT) &&
        Math.abs(Math.abs(p.GROSS_PROFIT) - Math.abs(expected)) <= Math.max(base * 0.01, 1_000_000) &&
        // A near-zero gross profit with the opposite sign can be a rounding or
        // definition difference; only a substantial inversion is a blocker.
        Math.abs(expected) / base >= 0.10

      if (signInverted) {
        results.push({
          checkName: "GROSS_PROFIT_IDENTITY",
          category: "accounting",
          severity: "high",
          passed: false,
          ticker, period,
          currentValue: p.GROSS_PROFIT, expectedValue: expected,
          autoFixable: false,
          issueClass: "blocker",
          rootCause: "SIGN_INVERSION",
          materialityRel: m.rel,
          materialityAbs: m.abs,
          details: `GROSS_PROFIT_IDENTITY FAILED: reported ${fmt(p.GROSS_PROFIT)} has the opposite sign of REVENUE − COGS = ${fmt(expected)} — sign inversion, quarantine and re-extract.`,
          detailsAr: `إجمالي الربح المسجل ${fmt(p.GROSS_PROFIT)} بإشارة معاكسة للإيرادات ناقص التكلفة (${fmt(expected)}) — انقلاب إشارة، يلزم العزل وإعادة الاستخراج.`,
        })
      } else if (m.material) {
        const r = identityFinding({
          ticker, period, checkName: "GROSS_PROFIT_IDENTITY",
          actual: p.GROSS_PROFIT, expected, base, relTolerance: 0.02,
          fields: ["REVENUE", "COGS", "GROSS_PROFIT"], rootCause: "IS_GROSS_PROFIT",
          advisoryRel: 0.10,
          note: "Check the COGS sign and whether the gross-profit line is before/after other operating items.",
        })
        if (r) results.push(r)
      }
    }

    // 1.3 Income statement plausibility flags (logical impossibilities)
    if (p.REVENUE !== undefined && p.GROSS_PROFIT !== undefined && p.REVENUE > 0 && p.GROSS_PROFIT > p.REVENUE * 1.02) {
      results.push({
        checkName: "GROSS_PROFIT_EXCEEDS_REVENUE",
        category: "accounting", severity: "critical", passed: false,
        ticker, period,
        currentValue: p.GROSS_PROFIT, expectedValue: p.REVENUE,
        autoFixable: false,
        issueClass: "blocker", rootCause: "IS_GROSS_PROFIT",
        details: `GROSS_PROFIT exceeds REVENUE — impossible (GP=${fmt(p.GROSS_PROFIT)} > REV=${fmt(p.REVENUE)}).`,
        detailsAr: `إجمالي الربح أكبر من الإيرادات — مستحيل منطقياً.`,
      })
    }
    if (!financial && p.REVENUE !== undefined && p.NET_PROFIT !== undefined && p.REVENUE > 0 && p.NET_PROFIT > p.REVENUE * 1.5) {
      results.push({
        checkName: "NET_PROFIT_EXCEEDS_REVENUE",
        category: "accounting", severity: "critical", passed: false,
        ticker, period,
        currentValue: p.NET_PROFIT, expectedValue: p.REVENUE,
        autoFixable: false,
        issueClass: "blocker", rootCause: "IS_MARGIN",
        details: `NET_PROFIT > REVENUE × 1.5 — impossible for non-financial companies (NI=${fmt(p.NET_PROFIT)}).`,
        detailsAr: `صافي الربح أكبر من الإيرادات — مستحيل للشركات غير المالية.`,
      })
    }
    if (p.OPERATING_INCOME !== undefined && p.NET_PROFIT !== undefined && p.OPERATING_INCOME > 0 && p.NET_PROFIT > p.OPERATING_INCOME * 2.5) {
      results.push({
        checkName: "NET_VS_OPERATING_SUSPICIOUS",
        category: "logical", severity: "medium", passed: false,
        ticker, period,
        currentValue: p.NET_PROFIT, expectedValue: p.OPERATING_INCOME,
        autoFixable: false,
        issueClass: "advisory", rootCause: "IS_OPERATING",
        details: `NET_PROFIT > 2.5× OPERATING_INCOME — verify holdings structure / one-off gains.`,
        detailsAr: `صافي الربح يفوق الربح التشغيلي بشكل مريب — يلزم التحقق.`,
      })
    }
    if (p.INCOME_TAX !== undefined && p.OPERATING_INCOME !== undefined && p.INCOME_TAX > Math.abs(p.OPERATING_INCOME) * 0.6 && p.INCOME_TAX > 0) {
      results.push({
        checkName: "TAX_RATE_SUSPICIOUS",
        category: "logical", severity: "medium", passed: false,
        ticker, period,
        currentValue: p.INCOME_TAX, expectedValue: p.OPERATING_INCOME,
        autoFixable: false,
        issueClass: "advisory", rootCause: "IS_TAX_BASIS",
        details: `INCOME_TAX > 60% of OPERATING_INCOME — verify consolidated vs standalone tax basis.`,
        detailsAr: `مخصص الضريبة مرتفع بشكل مريب مقارنة بالربح التشغيلي.`,
      })
    }

    // 1.4 PBT - |TAX| ≈ total NET_PROFIT, with minority interest explaining
    // the step down to NET_PROFIT_PARENT. If the NCI line is absent, derive it
    // from total - parent (UNIT FY2024: 130m total, 91.3m attributable, 38.7m
    // implied NCI). This keeps the identity on the total line while not
    // mislabelling a legitimate NCI as a blocker.
    if (p.PROFIT_BEFORE_TAX !== undefined && p.INCOME_TAX !== undefined && p.NET_PROFIT !== undefined) {
      // Tax is stored with its accounting sign: expense positive, benefit
      // negative. PBT − tax therefore adds back a tax benefit (EMFD Q2 2026:
      // PBT −2.658bn, tax −445m → net −2.213bn) and subtracts an expense.
      // The old PBT − |tax| wrongly treated a benefit as a second expense.
      const expected = p.PROFIT_BEFORE_TAX - p.INCOME_TAX
      const base = Math.max(Math.abs(p.PROFIT_BEFORE_TAX), Math.abs(p.NET_PROFIT))
      const gap = p.NET_PROFIT - expected
      const impliedNci = p.NET_PROFIT_PARENT !== undefined ? p.NET_PROFIT - p.NET_PROFIT_PARENT : undefined
      // Prefer the implied period NCI (total − parent) over the balance-sheet
      // NCI balance: the latter is a stock, not the period's profit share. AMER
      // FY2021 is explained by implied NCI 95.9m, while its NCI balance 102.3m
      // is 6.4m away and used to produce a false blocker.
      const nci = impliedNci ?? p.NON_CONTROLLING_INTERESTS
      // The implied NCI line is itself derived from total − parent, so a small
      // absolute difference is rounding, not a contradiction. A 2m floor keeps
      // small companies (UNIT FY2022: 1.06m on a 45m net) out of the blocker
      // queue without hiding material NCI gaps (OFH FY2024: 182m).
      const nciExplains = nci !== undefined && Math.abs(Math.abs(gap) - Math.abs(nci)) <= Math.max(base * 0.02, 2_000_000)
      if (!nciExplains) {
        const r = identityFinding({
          ticker, period, checkName: "PBT_TAX_NET_PROFIT",
          actual: p.NET_PROFIT, expected, base, relTolerance: 0.015,
          fields: ["PROFIT_BEFORE_TAX", "INCOME_TAX", "NET_PROFIT"], rootCause: "IS_TAX_BASIS",
          advisoryRel: 0.25,
          note: "Differences up to 25% are usually minority interest, discontinued operations or attributable-vs-total net profit.",
        })
        if (r) {
          // When the app stores only attributable net profit (NET_PROFIT ==
          // NET_PROFIT_PARENT) but a material NCI balance exists, the gap is
          // plausibly the period NCI. Keep it visible as HIGH instead of
          // pretending the identity passed.
          const nciBalance = p.NON_CONTROLLING_INTERESTS
          const likelyNci =
            p.NET_PROFIT === p.NET_PROFIT_PARENT &&
            nciBalance !== undefined &&
            nciBalance > 0 &&
            Math.abs(gap) <= Math.abs(nciBalance) * 0.25
          if (likelyNci && nciBalance !== undefined && r.severity === "critical") {
            r.severity = "high"
            r.issueClass = "coverage"
            r.details += ` — likely period NCI (balance-sheet NCI ${fmt(nciBalance)}); period NCI not stored.`
          }
          results.push(r)
        }
      }
    }

    // 1.5 Cash flow: OCF + ICF + FCF (+ FX effect) = NET_CHANGE_IN_CASH
    if (p.OPERATING_CASH_FLOW !== undefined && p.INVESTING_CASH_FLOW !== undefined && p.FINANCING_CASH_FLOW !== undefined && p.NET_CHANGE_IN_CASH !== undefined) {
      const fx = p.FX_EFFECT_CASH ?? 0
      const legs = p.OPERATING_CASH_FLOW + p.INVESTING_CASH_FLOW + p.FINANCING_CASH_FLOW
      const expectedWithFx = legs + fx
      const expectedNoFx = legs
      // Scale by the largest cash-flow leg AND the balance-sheet size: when the
      // legs cancel out, "200% of the legs" can still be immaterial.
      const assetsScale = p.TOTAL_ASSETS !== undefined ? Math.abs(p.TOTAL_ASSETS) * 0.02 : 0
      const base = Math.max(
        Math.abs(p.OPERATING_CASH_FLOW), Math.abs(p.INVESTING_CASH_FLOW),
        Math.abs(p.FINANCING_CASH_FLOW), Math.abs(p.NET_CHANGE_IN_CASH), assetsScale,
      )
      const gapWithFx = p.NET_CHANGE_IN_CASH - expectedWithFx
      const gapNoFx = p.NET_CHANGE_IN_CASH - expectedNoFx
      const m = materiality(Math.min(Math.abs(gapWithFx), Math.abs(gapNoFx)), base, 0.01)
      // A gap below 0.25% of the cash balance is immaterial even when the legs
      // technically fail to add up (rounding / small FX items).
      const cashFloor = Math.max(Math.abs(p.OPENING_CASH ?? 0), Math.abs(p.CLOSING_CASH ?? 0)) * 0.0025
      if (m.abs > Math.max(m.threshold, cashFloor)) {
        // Corroborate with the opening/closing cash movement. Three outcomes:
        //   * corroborated — the net change is trustworthy and only the
        //     breakdown is incomplete → coverage gap.
        //   * contradicted — opening/closing cash disagree with the reported
        //     net change → the net-change line itself is inconsistent → blocker.
        //   * unknown — opening/closing cash are not stored → advisory.
        const opening = p.OPENING_CASH
        const closing = p.CLOSING_CASH
        const oc = opening !== undefined && closing !== undefined ? closing - opening : undefined
        const corroborated = oc !== undefined
          ? Math.abs(p.NET_CHANGE_IN_CASH - oc) <= m.threshold
          : false
        // The legs are independently credible when they also reconcile to the
        // opening/closing movement (allowing a 10% band for rounded/missing FX).
        const legsCorroborated = oc !== undefined
          ? Math.abs(expectedWithFx - oc) <= Math.max(Math.abs(oc) * 0.10, m.threshold)
          : false
        const contradicted = oc !== undefined && !corroborated
        const unknown = oc === undefined
        const advisory = financial || unknown
        // If the net change is corroborated, only the breakdown is incomplete.
        const coverage = corroborated && !financial
        results.push({
          checkName: "CASH_FLOW_SUM",
          category: "accounting",
          severity: advisory ? "medium" : coverage ? (m.rel <= 0.10 ? "medium" : "high") : identitySeverity(m, { relTolerance: 0.01 }),
          passed: false,
          ticker, period,
          currentValue: p.NET_CHANGE_IN_CASH, expectedValue: expectedWithFx,
          autoFixable: false,
          issueClass: advisory ? "advisory" : coverage ? "coverage" : "blocker",
          rootCause: "CF_IDENTITY",
          materialityRel: m.rel,
          materialityAbs: m.abs,
          details: `CASH_FLOW_SUM ${advisory ? "FLAG" : coverage ? "COVERAGE_GAP" : "FAILED"}: gap ${(m.rel * 100).toFixed(2)}% (${fmt(Math.min(Math.abs(gapWithFx), Math.abs(gapNoFx)))} EGP) — ` +
            `${financial ? "financial-sector FX/restricted-cash effects are expected; " : ""}` +
            `${contradicted ? (legsCorroborated ? "legs reconcile to opening/closing cash, so the net-change line is the outlier; " : "net change and legs both contradict opening/closing cash; ") : corroborated ? "net change is corroborated by opening/closing cash, so the legs are incomplete; " : "opening/closing cash not stored; "}` +
            `${fx ? `FX effect ${fmt(fx)} tested; ` : "FX_EFFECT_CASH not disclosed; "}verify the cash-flow statement.`,
          detailsAr: `حصيلة التدفقات النقدية: فرق ${(m.rel * 100).toFixed(2)}% — ${corroborated ? "التغير الصافي مطابق لحركة النقد الافتتاحي/الختامي، أي أن البنود ناقصة" : "لا يوجد تأكيد مستقل من حركة النقد"}؛ تحقق من القوائم الأصلية وأثر فروق العملة.`,
        })
      }
    } else if (p.OPENING_CASH !== undefined && p.CLOSING_CASH !== undefined && p.NET_CHANGE_IN_CASH !== undefined) {
      const expected = p.CLOSING_CASH - p.OPENING_CASH
      const base = Math.max(Math.abs(p.OPENING_CASH), Math.abs(p.CLOSING_CASH), Math.abs(p.NET_CHANGE_IN_CASH))
      const r = identityFinding({
        ticker, period, checkName: "CASH_OPENING_CLOSING",
        actual: p.NET_CHANGE_IN_CASH, expected, base, relTolerance: 0.01,
        fields: ["OPENING_CASH", "CLOSING_CASH", "NET_CHANGE_IN_CASH"], rootCause: "CF_IDENTITY",
        advisoryRel: 0.05,
        note: "The difference is often the FX effect on cash.",
      })
      if (r) results.push(r)
    }

    // 1.6 OCF vs NI + D&A (advisory cash-quality signal, never an error)
    if (p.OPERATING_CASH_FLOW !== undefined && p.NET_PROFIT !== undefined && p.NET_PROFIT > 0) {
      const da = Math.abs(p.DEPRECIATION_EXPENSE ?? p.DEPRECIATION_AMORTIZATION ?? 0)
      const target = p.NET_PROFIT + da
      if (target > 0 && p.OPERATING_CASH_FLOW > 0) {
        const ratio = p.OPERATING_CASH_FLOW / target
        if (ratio < 0.4 || ratio > 3) {
          results.push({
            checkName: "OCF_VS_NET_INCOME",
            category: "accounting", severity: "low", passed: false,
            ticker, period,
            currentValue: ratio, expectedValue: 1,
            autoFixable: false,
            issueClass: "advisory", rootCause: "CASH_QUALITY",
            details: `OCF/(NI+D&A) ratio ${ratio.toFixed(2)} outside the 0.4–3 band — inspect working-capital swings (advisory, not an error).`,
            detailsAr: `نسبة التدفق التشغيلي لصافي الربح ${ratio.toFixed(2)} خارج النطاق 0.4–3 — راجع رأس المال العامل (إرشادي).`,
          })
        }
      }
    }

    // 1.7 Component identities: CA+NCA=A, CL+NCL=L
    // A component gap usually means "other assets/liabilities" were not
    // captured, not that the totals are wrong. It is a coverage gap, never a
    // contradictory blocker.
    for (const [checkName, total, partA, partB, codeA, codeB, codeTotal] of [
      ["ASSET_COMPONENTS", p.TOTAL_ASSETS, p.CURRENT_ASSETS, p.NON_CURRENT_ASSETS, "CURRENT_ASSETS", "NON_CURRENT_ASSETS", "TOTAL_ASSETS"],
      ["LIABILITY_COMPONENTS", p.TOTAL_LIABILITIES, p.CURRENT_LIABILITIES, p.NON_CURRENT_LIABILITIES, "CURRENT_LIABILITIES", "NON_CURRENT_LIABILITIES", "TOTAL_LIABILITIES"],
    ] as Array<[string, number | undefined, number | undefined, number | undefined, string, string, string]>) {
      if (total === undefined || partA === undefined || partB === undefined) continue
      const expected = partA + partB
      const base = Math.abs(total)
      const m = materiality(total - expected, base, 0.01)
      if (!m.material) continue
      const advisory = m.rel <= 0.10
      results.push({
        checkName,
        category: "accounting",
        // A component gap is a coverage gap: the total can be correct while
        // "other assets/liabilities" were not captured. It must stay visible,
        // but it is not a contradictory blocker.
        severity: advisory ? "medium" : "high",
        passed: false, ticker, period,
        currentValue: total, expectedValue: expected,
        autoFixable: false,
        issueClass: advisory ? "advisory" : "coverage",
        rootCause: "BS_COMPONENTS",
        materialityRel: m.rel, materialityAbs: m.abs,
        details: `${checkName} ${advisory ? "FLAG" : "COVERAGE_GAP"}: ${codeA}+${codeB} = ${fmt(expected)} vs ${codeTotal} = ${fmt(total)} (${(m.rel * 100).toFixed(2)}%) — missing/extra component or mapping gap.`,
        detailsAr: `${checkName}: مجموع المكونات ${fmt(expected)} مقابل الإجمالي ${fmt(total)} (${(m.rel * 100).toFixed(2)}%) — مكوّن ناقص أو خطأ ربط.`,
      })
    }

    // 1.8 Debt components: TOTAL_DEBT is often a superset (leases, other debt)
    if (p.SHORT_TERM_DEBT !== undefined && p.LONG_TERM_DEBT !== undefined && p.TOTAL_DEBT !== undefined) {
      const components = p.SHORT_TERM_DEBT + p.LONG_TERM_DEBT
      const base = Math.max(Math.abs(p.TOTAL_DEBT), Math.abs(components))
      const m = materiality(components - p.TOTAL_DEBT, base, 0.02)
      if (m.material) {
        const impossible = components > p.TOTAL_DEBT * 1.02
        // A total larger than its components can legitimately include leases or
        // other borrowings. Components exceeding the total usually means the
        // reported "total debt" is a net or narrower definition (for example,
        // excluding short-term borrowings), so it is a definition/coverage gap,
        // not a contradictory blocker.
        const advisory = !impossible
        results.push({
          checkName: "DEBT_COMPONENTS",
          category: "accounting",
          severity: impossible ? "high" : advisory ? "low" : "medium",
          passed: false,
          ticker, period,
          currentValue: p.TOTAL_DEBT, expectedValue: components,
          autoFixable: false,
          issueClass: advisory ? "advisory" : "coverage",
          rootCause: "DEBT_DEFINITION",
          materialityRel: m.rel,
          materialityAbs: m.abs,
          details: `DEBT_COMPONENTS ${advisory ? "FLAG" : "COVERAGE_GAP"}: ST+LT = ${fmt(components)} vs TOTAL_DEBT = ${fmt(p.TOTAL_DEBT)} ` +
            `(${(m.rel * 100).toFixed(1)}%). ${impossible ? "Components exceed the reported total — the total-debt definition is narrower than gross borrowings; confirm the definition." : "Total debt may include leases/other debt; confirm the definition."}`,
          detailsAr: `مكونات الدين: مجموع القصير والطويل ${fmt(components)} مقابل الإجمالي ${fmt(p.TOTAL_DEBT)} (${(m.rel * 100).toFixed(1)}%) — تحقق من تعريف إجمالي الدين.`,
        })
      }
    }
  }
  return results
}
