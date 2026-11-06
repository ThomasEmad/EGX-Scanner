import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const TICKERS = ["DAPH","ASPI","ATLC","HELI","MPRC","TAQA","HRHO","OFH","TMGH","DSCW"]
const LABELS = ["صافي الربح","مجمل الربح","إجمالي الأصول","حقوق المساهمين","إجمالي المطلوبات","الإيرادات"]
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
function parseNum(s) { const m = s.match(/([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?/); if (!m) return null; const n = Number(m[1].replace(/,/g,"").replace("−","-")); if (!Number.isFinite(n)) return null; const mult = m[2]==="تريليون"?1e12:m[2]==="مليار"?1e9:m[2]==="مليون"?1e6:m[2]==="ألف"?1e3:1; return n*mult }
function parseTable(text) {
  const start = text.indexOf("القوائم المالية الملخصة"); if (start < 0) return null
  const end = text.indexOf("سجّل مجانًا", start); const table = text.slice(start, end>0?end:start+3000)
  const years = [...table.matchAll(/\b(20\d{2})\b/g)].slice(0,5).map(m=>Number(m[1]))
  const rows = {}
  for (let i=0;i<LABELS.length;i++) {
    const label = LABELS[i]; const at = table.indexOf(label); if (at<0) { rows[label]=null; continue }
    const nextAt = LABELS.slice(i+1).map(l=>table.indexOf(l, at+label.length)).filter(x=>x>0).sort((a,b)=>a-b)[0] ?? table.length
    const seg = table.slice(at+label.length, nextAt); const nums=[]; const re=/([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?/g; let m
    while ((m=re.exec(seg)) && nums.length<5) { const v=parseNum(m[0]); if (v!==null) nums.push(v) }
    rows[label]=nums
  }
  return { years, rows }
}
try {
  for (const t of TICKERS) {
    const c = await db.company.findUnique({ where: { ticker: t }, select: { id: true, nameEn: true, sector: true } })
    console.log(`\n######## ${t} ${c.nameEn} [${c.sector}] ########`)
    const reps = await db.financialReport.findMany({ where: { companyId: c.id, periodType: "ANNUAL", fiscalYear: { gte: 2023 } }, orderBy: { fiscalYear: "desc" }, take: 3, select: { fiscalYear: true, periodEnd: true, sourceName: true, values: { where: { metricCode: { in: ["NET_PROFIT","NET_PROFIT_PARENT","TOTAL_EQUITY","TOTAL_ASSETS","TOTAL_LIABILITIES","REVENUE","GROSS_PROFIT","COGS"] } }, select: { metricCode: true, normalizedValue: true, validationStatus: true } } } })
    for (const r of reps) console.log(`APP ${r.fiscalYear} end=${r.periodEnd?.toISOString().slice(0,10)} [${r.sourceName}] ${r.values.map(v=>`${v.metricCode}=${v.normalizedValue}${v.validationStatus!=="VALID"?"("+v.validationStatus+")":""}`).join(" ")}`)
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const parsed = parseTable(stripHtml(await res.text()))
    if (!parsed) { console.log("ASK: no table"); continue }
    console.log(`ASK years=${parsed.years.join(",")}`)
    for (const l of LABELS) if (parsed.rows[l]) console.log(`  ${l}: ${parsed.rows[l].map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
  }
} finally { await db.$disconnect() }
