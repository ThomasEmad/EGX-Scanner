/* Identity-based scale solver v3 — STRICT: only intra-report mathematical identities that hold
   at ÷1000 and fail at stored scale (>50x off), with the identity's reference side verified sane
   (|TA| <= 100x mcap). Plus CF rows > 10x mcap (non-bank). NO mcap-only or NP-margin rules
   (both produced false positives: EGBE shares suspect, EGAS NP-row wrong-tiny).
   Usage: node fix-scale-identities.cjs | APPLY=1 node fix-scale-identities.cjs */
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()
const ALL = ["TOTAL_ASSETS","TOTAL_LIABILITIES","TOTAL_EQUITY","TOTAL_EQUITY_AND_LIABILITIES","CURRENT_ASSETS","CURRENT_LIABILITIES","NON_CURRENT_ASSETS","CASH_AND_EQUIVALENTS","INVENTORY","SHORT_TERM_DEBT","LONG_TERM_DEBT","TOTAL_DEBT","OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH"]
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1)

;(async () => {
  const companies = await db.company.findMany({ where: { isActive: true }, select: { id: true, ticker: true, sector: true, sharesOutstanding: true } })
  const prices = await db.marketPrice.groupBy({ by: ["companyId"], _max: { price: true } })
  const pxOf = new Map(prices.map(p => [p.companyId, p._max.price]))
  const rows = await db.financialValue.findMany({ where: { metricCode: { in: ALL } }, select: { id: true, companyId: true, metricCode: true, normalizedValue: true, reportId: true, report: { select: { periodLabel: true, periodType: true } } } })
  const byCompany = new Map()
  for (const r of rows) {
    if (r.normalizedValue == null) continue
    if (!byCompany.has(r.companyId)) byCompany.set(r.companyId, new Map())
    const byReport = byCompany.get(r.companyId)
    if (!byReport.has(r.reportId)) byReport.set(r.reportId, { label: r.report.periodLabel, row: {} })
    byReport.get(r.reportId).row[r.metricCode] = r
  }
  const plan = []
  const del = []
  // cross-company decimal fingerprints (Excel spray artifacts)
  const fp = new Map()
  for (const [cid, byReport] of byCompany) for (const [, rep] of byReport) for (const [k, v] of Object.entries(rep.row)) {
    if (Math.abs(v.normalizedValue) < 1e5) continue
    const key = k + "|" + v.normalizedValue.toFixed(2)
    if (!fp.has(key)) fp.set(key, new Set())
    fp.get(key).add(cid)
  }
  for (const c of companies) {
    // per-company median |TA| for reference-sanity
    const taVals = []
    for (const [, rep] of byCompany.get(c.id) || []) if (rep.row.TOTAL_ASSETS) taVals.push(Math.abs(rep.row.TOTAL_ASSETS.normalizedValue))
    taVals.sort((a, b) => a - b)
    const taMed = taVals.length ? taVals[Math.floor(taVals.length / 2)] : null
    const medOf = (code) => {
      const vs = []
      for (const [, rep] of byCompany.get(c.id) || []) if (rep.row[code]) vs.push(Math.abs(rep.row[code].normalizedValue))
      vs.sort((a, b) => a - b)
      return vs.length ? vs[Math.floor(vs.length / 2)] : null
    }
    const tlMed = medOf("TOTAL_LIABILITIES"), caMed = medOf("CURRENT_ASSETS")
    const byReport = byCompany.get(c.id)
    if (!byReport) continue
    const px = pxOf.get(c.id)
    if (!px || px < 0.5 || !c.sharesOutstanding) continue
    const mc = c.sharesOutstanding * px
    if (mc < 1e8) continue
    const isBank = (c.sector || "") === "Banks"
    for (const [reportId, rep] of byReport) {
      const row = rep.row
      const V = (k) => (row[k] ? row[k].normalizedValue : null)
      const flippedHere = new Set()
      const medCache = {}
      const medOfCode = (code) => {
        if (!(code in medCache)) medCache[code] = medOf(code)
        return medCache[code]
      }
      const flip = (k, why, bypassMedian) => {
        const v = row[k]; if (!v) return
        const fixedVal = v.normalizedValue / 1000
        const med = medOfCode(k)
        if (!bypassMedian && med != null && Math.abs(v.normalizedValue) < 20 * med) return // row is normal vs its own history; identity alone can't overrule
        const isFP = (fp.get(k + "|" + v.normalizedValue.toFixed(2)) || new Set()).size >= 2
        if (Math.abs(fixedVal) < 1e6) {
          if (isFP && Math.abs(v.normalizedValue) > 50 * Math.max(Math.abs(ta), 1e6)) del.push({ id: v.id, ticker: c.ticker, code: k, label: rep.label, stored: v.normalizedValue, why: "Excel cross-company fingerprint; absurd at both scales -> delete" })
          return
        }
        plan.push({ id: v.id, ticker: c.ticker, code: k, label: rep.label, stored: v.normalizedValue, fixedVal, why })
        flippedHere.add(k)
      }
      const ta = V("TOTAL_ASSETS")
      const taSane = ta != null && Math.abs(ta) <= 100 * mc && Math.abs(ta) > 1e6 && taMed != null && Math.abs(ta) >= 0.05 * taMed
      if (!taSane) continue // no sane reference side => no identity adjudication possible
      const tl = V("TOTAL_LIABILITIES"), te = V("TOTAL_EQUITY")
      if (tl != null && te != null && Math.abs(tl + te) > 50 * Math.abs(ta) && !near(tl + te, ta, 0.05) && near(tl / 1000 + te / 1000, ta, 0.05)) {
        flip("TOTAL_LIABILITIES", "TL+TE=TA holds only at /1000", true); flip("TOTAL_EQUITY", "TL+TE=TA holds only at /1000", true)
      }
      const teal = V("TOTAL_EQUITY_AND_LIABILITIES")
      if (teal != null && !near(teal, ta, 0.05) && near(teal / 1000, ta, 0.05) && Math.abs(teal) > 50 * Math.abs(ta)) flip("TOTAL_EQUITY_AND_LIABILITIES", "TEAL=TA holds only at /1000")
      const ca = V("CURRENT_ASSETS"), nca = V("NON_CURRENT_ASSETS")
      if (ca != null && nca != null && Math.abs(ca) > 50 * Math.abs(ta) && !near(ca + nca, ta, 0.06) && near(ca / 1000 + nca / 1000, ta, 0.06)) {
        flip("CURRENT_ASSETS", "CA+NCA=TA holds only at /1000", true); flip("NON_CURRENT_ASSETS", "CA+NCA=TA holds only at /1000", true)
      } else {
        if (ca != null && Math.abs(ca) > Math.abs(ta) * 1.05 && Math.abs(ca / 1000) <= Math.abs(ta)) flip("CURRENT_ASSETS", "CA > TA; fits at /1000")
        if (nca != null && Math.abs(nca) > Math.abs(ta) * 1.05 && Math.abs(nca / 1000) <= Math.abs(ta)) flip("NON_CURRENT_ASSETS", "NCA > TA; fits at /1000")
      }
      const caEffRaw = flippedHere.has("CURRENT_ASSETS") ? Math.abs(V("CURRENT_ASSETS")) / 1000 : (ca != null ? Math.abs(ca) : null)
      const caEff = caEffRaw != null && caEffRaw <= Math.abs(ta) * 1.05 && (caMed == null || caEffRaw >= 0.05 * caMed) ? caEffRaw : null
      if (caEff != null) {
        for (const k of ["CASH_AND_EQUIVALENTS", "INVENTORY"]) {
          const v = V(k)
          if (v != null && Math.abs(v) > Math.max(caEff * 1.05, Math.abs(ta)) && Math.abs(v / 1000) <= caEff) flip(k, `${k} > CA; fits at /1000`)
        }
      }
      const tlEffRaw = flippedHere.has("TOTAL_LIABILITIES") ? Math.abs(tl) / 1000 : (tl != null ? Math.abs(tl) : null)
      const tlEff = tl != null && tlEffRaw != null && tlEffRaw <= Math.abs(ta) * 1.05 && (tlMed == null || tlEffRaw >= 0.05 * tlMed) ? tlEffRaw : null
      if (tlEff != null) {
        const std = V("SHORT_TERM_DEBT"), ltd = V("LONG_TERM_DEBT"), td = V("TOTAL_DEBT")
        if (std != null && Math.abs(std) > Math.max(tlEff * 1.05, Math.abs(ta)) && Math.abs(std / 1000) <= tlEff) flip("SHORT_TERM_DEBT", "STD > TL; fits at /1000")
        if (ltd != null && Math.abs(ltd) > Math.max(tlEff * 1.05, Math.abs(ta)) && Math.abs(ltd / 1000) <= tlEff) flip("LONG_TERM_DEBT", "LTD > TL; fits at /1000")
        if (td != null && std != null && ltd != null && !near(std + ltd, td, 0.1) && near(std / 1000 + ltd / 1000, td, 0.1) && Math.abs(td) > 50 * tlEff) flip("TOTAL_DEBT", "STD+LTD=TD holds only at /1000")
        else if (td != null && Math.abs(td) > Math.max(tlEff * 1.05, Math.abs(ta)) && Math.abs(td / 1000) <= tlEff) flip("TOTAL_DEBT", "TD > TL; fits at /1000")
      }
      if (!isBank) for (const k of ["OPERATING_CASH_FLOW", "INVESTING_CASH_FLOW", "FINANCING_CASH_FLOW", "NET_CHANGE_IN_CASH"]) {
        const v = V(k)
        if (v != null && Math.abs(v) > 10 * mc) flip(k, "CF > 10x mcap", true)
      }
    }
  }
  const seen = new Set()
  const unique = plan.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)))
  const ud = []
  const dseen = new Set()
  for (const p of del) if (!dseen.has(p.id)) { dseen.add(p.id); ud.push(p) }
  console.log(`identity-solver v3 flips: ${unique.length} | fingerprint deletes: ${ud.length}`)
  for (const p of ud.slice(0, 30)) console.log(`DEL  ${p.ticker.padEnd(6)} ${p.code.padEnd(28)} ${p.label.padEnd(9)} ${String(p.stored).padStart(18)}`)
  const byT = {}
  for (const p of unique) { byT[p.ticker] = (byT[p.ticker] || 0) + 1 }
  console.log("by company:", JSON.stringify(byT))
  for (const p of unique.slice(0, 80)) console.log(`FLIP ${p.ticker.padEnd(6)} ${p.code.padEnd(28)} ${p.label.padEnd(9)} ${String(p.stored).padStart(18)} -> ${p.fixedVal.toPrecision(12)}  [${p.why}]`)
  if (unique.length > 80) console.log(`... +${unique.length - 80} more`)
  if (process.env.APPLY === "1") {
    for (const p of ud) { try { await db.financialValue.delete({ where: { id: p.id } }) } catch {} }
    let n = 0
    for (const p of unique) {
      const v = await db.financialValue.findUnique({ where: { id: p.id }, select: { normalizedValue: true } })
      if (!v || Math.abs(v.normalizedValue - p.stored) > Math.abs(p.stored) * 0.001) { console.log(`GUARD-SKIP ${p.id}`); continue }
      await db.financialValue.update({ where: { id: p.id }, data: { normalizedValue: p.fixedVal, value: p.fixedVal } })
      n++
    }
    console.log(`APPLIED: ${n}`)
  }
  await db.$disconnect()
})().catch((e) => { console.error(e); process.exit(1) })
