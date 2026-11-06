import { chromium } from "playwright"
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: "en-US" })
const p = await ctx.newPage()
await p.goto("https://www.tradingview.com/symbols/EGX-ABUK/financials-income-statement/", { waitUntil: "domcontentloaded", timeout: 45000 })
await p.waitForTimeout(8000)

// exact probe from the import script
const { PROBE_FN } = { PROBE_FN: String.raw`
(() => {
  let n = 0, quarterly = false, headers = null;
  for (const el of document.querySelectorAll('[data-name]')) {
    for (const k of Object.keys(el)) {
      if (!k.startsWith('__reactFiber')) continue;
      let cur = el[k], d = 0;
      while (cur && d < 6) {
        const p = cur.memoizedProps;
        if (p && p.idWithoutPeriod && Array.isArray(p.values) && p.values.length > 0) { n++; break; }
        cur = cur.return; d++;
      }
    }
  }
  return { n };
})()
` }
const probe = await p.evaluate(PROBE_FN)
console.log("probe:", JSON.stringify(probe))

// what do data-name elements actually carry?
const diag = await p.evaluate(() => {
  const els = [...document.querySelectorAll("[data-name]")].slice(0, 10)
  return els.map((el) => {
    const keys = Object.keys(el)
    return { name: el.getAttribute("data-name"), fiberKeys: keys.filter((k) => k.startsWith("__react")).length, allKeys: keys.length }
  })
})
console.log(JSON.stringify(diag, null, 1))
await b.close()
