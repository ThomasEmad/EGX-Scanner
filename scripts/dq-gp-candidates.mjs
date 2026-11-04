import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const vals = await db.financialValue.findMany({
    where: { metricCode: { in: ["REVENUE", "COGS", "GROSS_PROFIT"] }, validationStatus: "VALID" },
    select: { reportId: true, subPeriod: true, metricCode: true, normalizedValue: true, report: { select: { periodLabel: true, company: { select: { ticker: true } } } } },
  })
  const groups = new Map()
  for (const v of vals) {
    const k = v.reportId + "|" + (v.subPeriod ?? "CURRENT")
    if (!groups.has(k)) groups.set(k, { report: v.report, sub: v.subPeriod, m: {} })
    groups.get(k).m[v.metricCode] = v.normalizedValue
  }
  const out = []
  for (const g of groups.values()) {
    const { REVENUE: r, COGS: c, GROSS_PROFIT: gp } = g.m
    if (r === undefined || c === undefined || gp === undefined) continue
    const expected = r - Math.abs(c)
    const base = Math.max(Math.abs(r), Math.abs(c), Math.abs(gp))
    if (!(Math.sign(expected) !== 0 && Math.sign(gp) !== 0 && Math.sign(expected) !== Math.sign(gp))) continue
    const magDiff = Math.abs(Math.abs(gp) - Math.abs(expected)) / base
    if (magDiff > 0.05) continue
    out.push({ ticker: g.report.company.ticker, period: g.report.periodLabel, sub: g.sub, gp, expected, magDiff: Number((magDiff * 100).toFixed(3)), rel: Number((Math.abs(expected) / base * 100).toFixed(1)) })
  }
  out.sort((a, b) => b.magDiff - a.magDiff)
  console.log("sign-inversion candidates:", out.length)
  for (const o of out) console.log(o.ticker.padEnd(6), o.period.padEnd(10), o.sub.padEnd(8), "GP", o.gp.toExponential(2), "exp", o.expected.toExponential(2), "magDiff%", o.magDiff, "exp/base%", o.rel)
} finally { await db.$disconnect() }
