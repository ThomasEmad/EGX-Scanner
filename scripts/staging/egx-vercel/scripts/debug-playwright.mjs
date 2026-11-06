import { chromium } from "playwright"
const b = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] })
const ctx = await b.newContext({ viewport: { width: 1600, height: 900 }, locale: "en-US" })
const p = await ctx.newPage()
const res = await p.goto("https://www.tradingview.com/symbols/EGX-ABUK/financials-income-statement/", { waitUntil: "domcontentloaded", timeout: 45000 })
console.log("HTTP", res.status(), "title:", (await p.title()).slice(0, 60))
await p.waitForTimeout(8000)
const info = await p.evaluate(() => ({
  dataNames: document.querySelectorAll("[data-name]").length,
  initBlobs: document.querySelectorAll('script[type="application/prs.init-data+json"]').length,
  valueDivs: document.querySelectorAll('div[class*="value-"]').length,
  bodyLen: document.body.innerText.length,
  quarterlyBtn: [...document.querySelectorAll("button")].some((e) => (e.textContent || "").trim() === "Quarterly"),
  hasRevenue: document.body.innerText.includes("Total revenue"),
  title: document.title.slice(0, 50),
  consent: document.body.innerText.slice(0,400).includes("Accept"),
}))
console.log(JSON.stringify(info, null, 1))
await p.screenshot({ path: "/tmp/render/tv-debug.png", fullPage: false }).catch(() => {})
await b.close()
