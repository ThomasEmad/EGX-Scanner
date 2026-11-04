import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const TARGETS = [["ARAB",[2021,2023]],["ASCM",[2023]],["COSG",[2023,2024]],["EGAS",[2022]],["MAAL",[2023]],["MFPC",[2023]],["MIPH",[2024]],["OLFI",[2024]],["PHDC",[2022]],["UEGC",[2021]],["DSCW",[2024]],["OCDI",[2025]],["ZMID",[2025]],["ATQA",[2024]]]
const LABELS = ["التدفق النقدي التشغيلي","التدفق النقدي الاستثماري","التدفق النقدي التمويلي","صافي التغير في النقد"]
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
function parseNum(s) {
  const m = s.match(/([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g,"").replace("−","-"))
  if (!Number.isFinite(n)) return null
  const mult = m[2] === "تريليون" ? 1e12 : m[2] === "مليار" ? 1e9 : m[2] === "مليون" ? 1e6 : m[2] === "ألف" ? 1e3 : 1
  return n * mult
}
function parseTable(text) {
  const start = text.indexOf("القوائم المالية الملخصة")
  if (start < 0) return null
  const end = text.indexOf("سجّل مجانًا", start)
  const table = text.slice(start, end > 0 ? end : start + 3000)
  const years = [...table.matchAll(/\b(20\d{2})\b/g)].slice(0,5).map(m=>Number(m[1]))
  const rows = {}
  for (let i=0;i<LABELS.length;i++) {
    const label = LABELS[i]
    const at = table.indexOf(label)
    if (at < 0) { rows[label] = null; continue }
    const nextAt = LABELS.slice(i+1).map(l=>table.indexOf(l, at+label.length)).filter(x=>x>0).sort((a,b)=>a-b)[0] ?? table.length
    const seg = table.slice(at+label.length, nextAt)
    const nums = []
    const re = /([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?/g
    let m
    while ((m = re.exec(seg)) && nums.length < 5) {
      const v = parseNum(m[0])
      if (v !== null) nums.push(v)
    }
    rows[label] = nums
  }
  return { years, rows }
}
try {
  for (const [t, years] of TARGETS) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true } })
    console.log(`\n######## ${t} ${c.nameEn} ########`)
    for (const y of years) {
      const r = await db.financialReport.findFirst({ where: { companyId: c.id, fiscalYear: y, periodType: "ANNUAL" }, orderBy: [{ version: "desc" }, { createdAt: "desc" }], select: { sourceName: true, values: { where: { metricCode: { in: ["OPERATING_CASH_FLOW","INVESTING_CASH_FLOW","FINANCING_CASH_FLOW","NET_CHANGE_IN_CASH","OPENING_CASH","CLOSING_CASH","FX_EFFECT_CASH"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
      console.log(`APP ${y} ${r?.sourceName}: ${r?.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
    }
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const parsed = parseTable(stripHtml(await res.text()))
    if (!parsed) { console.log("ASK: table not found"); continue }
    console.log("ASK years", parsed.years.join(","))
    for (const label of LABELS) console.log(`  ${label}: ${(parsed.rows[label]??[]).map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
  }
} finally { await db.$disconnect() }
