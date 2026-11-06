function stripHtml(html) { return html.replace(/<script[\s\S]*?<\/script>/g," ").replace(/<style[\s\S]*?<\/style>/g," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ") }
for (const t of ["EGAL","EAST","CANA"]) {
  const r = await fetch(`https://askborsa.com/company/${t}`, { headers: { "user-agent": "Mozilla/5.0" } })
  const text = stripHtml(await r.text())
  const i = text.indexOf("القوائم المالية الملخصة")
  console.log(`\n===== ${t} =====`)
  console.log(i >= 0 ? text.slice(i, i + 2200) : text.slice(0, 2200))
}
