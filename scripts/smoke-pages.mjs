for (const url of [
  "http://localhost:3000/company/UNIT",
  "http://localhost:3000/data-quality?ticker=UNIT",
  "http://localhost:3000/api/v1/companies/cmui726t3005xbx90f8btgbfc/confidence",
  "http://localhost:3000/api/v1/data-quality?ticker=UNIT",
  "http://localhost:3000/rankings",
]) {
  const r = await fetch(url)
  const text = await r.text()
  console.log(`${r.status} ${url} bytes=${text.length}${text.includes("Application error") ? " APP_ERROR" : ""}`)
}
