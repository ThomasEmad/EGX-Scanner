const TICKERS = ["SCTS","MCQE","EFID","FERC","HDBK","ADRI","ALCN","EGAL","ARCC","MBSC","ABUK","ADCI"]
const LABELS = ["صافي الربح","إجمالي الأصول","حقوق المساهمين","إجمالي المطلوبات"]
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
for (const t of TICKERS) {
  try {
    const res = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
    const parsed = parseTable(stripHtml(await res.text()))
    if (!parsed) { console.log(`${t}: no table`); continue }
    const np = parsed.rows["صافي الربح"], eq = parsed.rows["حقوق المساهمين"], ta = parsed.rows["إجمالي الأصول"], tl = parsed.rows["إجمالي المطلوبات"]
    console.log(`\n${t} years=${parsed.years.join(",")}`)
    console.log(`  net profit: ${np?.map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
    console.log(`  equity:     ${eq?.map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
    console.log(`  assets:     ${ta?.map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
    console.log(`  liabilities:${tl?.map(v=>v?.toLocaleString("en-US")).join(" | ")}`)
    if (np && eq) console.log(`  ROE:        ${np.map((v,i)=>v!=null&&eq[i]?((v/eq[i])*100).toFixed(2)+"%":"n/a").join(" | ")}`)
  } catch (e) { console.log(`${t}: ${e.message}`) }
}
