const LABELS = { net_profit: ["صافي الربح"], total_assets: ["إجمالي الأصول"], total_equity: ["حقوق المساهمين", "حقوق الملكية"] }
function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
function parseFigure(text, labels) {
  let best = null
  for (const label of labels) {
    const re = new RegExp(label + String.raw`\s*·\s*(\d{4})\s*([−-]?[\d.,]+)\s*(تريليون|مليار|مليون|ألف)?`, "g")
    let m
    while ((m = re.exec(text))) {
      const year = Number(m[1]); const raw = m[2].replace(/,/g,"").replace("−","-"); const n = Number(raw)
      if (!Number.isFinite(n)) continue
      const unit = m[3]; const mult = unit === "تريليون" ? 1e12 : unit === "مليار" ? 1e9 : unit === "مليون" ? 1e6 : unit === "ألف" ? 1e3 : 1
      const value = n * mult
      if (!best || year > best.year) best = { year, value, unit: unit ?? "", raw: m[2] }
    }
  }
  return best
}
for (const t of ["COMI","ORAS","ARCC","MBSC","MPCI","AXPH"]) {
  const r = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
  const text = stripHtml(await r.text())
  const cur = text.match(/العملة\s*(EGP|USD|EUR|SAR|AED|جنيه|دولار)/)?.[1] ?? null
  console.log(`\n${t} currency=${cur}`)
  for (const [k, labels] of Object.entries(LABELS)) console.log(`  ${k}`, parseFigure(text, labels))
}
