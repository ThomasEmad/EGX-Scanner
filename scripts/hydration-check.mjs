import { chromium } from 'playwright';

const BASE = 'http://localhost:3001';
const PAGES = ['/', '/dashboard', '/rankings', '/sectors', '/dividends', '/data-quality',
  '/undervalued', '/compare', '/watchlist', '/portfolio', '/premium', '/about',
  '/company/ABUK', '/sectors/Banks'];

const browser = await chromium.launch();
const page = await browser.newPage();
const findings = [];
for (const p of PAGES) {
  const msgs = [];
  const onC = m => { const t = m.text(); if (t.includes('ydration') || t.includes('418') || t.includes('mismatch')) msgs.push('[console] ' + t.slice(0, 400)); };
  const onE = e => { const t = String(e); if (t.includes('ydration') || t.includes('418')) msgs.push('[pageerror] ' + t.slice(0, 600)); };
  page.on('console', onC); page.on('pageerror', onE);
  await page.goto(BASE + p, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  page.off('console', onC); page.off('pageerror', onE);
  if (msgs.length) findings.push({ p, msgs });
  console.log(`${p}: ${msgs.length ? 'HYDRATION PROBLEM' : 'ok'}`);
}
console.log('\n===== DETAILS =====');
for (const f of findings) {
  console.log('\n--- ' + f.p);
  f.msgs.slice(0, 3).forEach(m => console.log(m));
}
await browser.close();
