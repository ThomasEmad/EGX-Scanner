import { chromium } from 'playwright';
import fs from 'fs';

const BASE = 'http://localhost:3000';
const OUT_DIR = '/tmp/render-fx';
fs.mkdirSync(OUT_DIR, { recursive: true });

// All main routes a real user/investor would hit
const PAGES = [
  { path: '/', name: '01-landing' },
  { path: '/companies', name: '02-companies' },
  { path: '/dashboard', name: '03-dashboard' },
  { path: '/rankings', name: '04-rankings' },
  { path: '/sectors', name: '05-sectors' },
  { path: '/dividends', name: '06-dividends' },
  { path: '/data-quality', name: '07-data-quality' },
  { path: '/undervalued', name: '08-undervalued' },
  { path: '/scanners', name: '09-scanners' },
  { path: '/compare', name: '10-compare' },
  { path: '/watchlist', name: '11-watchlist' },
  { path: '/portfolio', name: '12-portfolio' },
  { path: '/premium', name: '13-premium' },
  { path: '/about', name: '14-about' },
  { path: '/login', name: '15-login' },
  { path: '/register', name: '16-register' },
  { path: '/company/ABUK', name: '17-company-abuk' },
  { path: '/company/COMI', name: '18-company-comi' },
  { path: '/company/HDBK', name: '19-company-hdbk' },
  { path: '/sectors/Banks', name: '20-sector-banks' },
  { path: '/privacy', name: '21-privacy' },
  { path: '/terms', name: '22-terms' },
  { path: '/disclaimer', name: '23-disclaimer' },
  { path: '/company/UNIT/report', name: '24-company-report' },
];

// APIs to verify
const APIS = [
  '/api/v1/health', '/api/v1/metrics', '/api/v1/companies', '/api/v1/sectors',
  '/api/v1/rankings?metric=roe', '/api/v1/dividends', '/api/v1/data-quality',
  '/api/v1/undervalued', '/api/v1/dashboard', '/api/v1/dashboard/summary',
  '/api/v1/market/ticker', '/api/v1/market/breadth', '/api/v1/events',
  '/api/v1/qa?q=what', '/api/v1/scanners', '/api/v1/settings/public',
];

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

for (const p of PAGES) {
  const errors = [];
  const consoleErrors = [];
  const failedRequests = [];
  const onConsole = m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)); };
  const onPageError = e => errors.push(String(e).slice(0, 300));
  const onReqFailed = r => { if (!r.url().includes('_next/webpack-hmr')) failedRequests.push(`FAILED ${r.url().slice(0, 140)}`.slice(0, 200)); };
  const onResp = r => { if (r.status() >= 400 && r.url().startsWith(BASE)) failedRequests.push(`HTTP ${r.status()} ${r.url().slice(0, 140)}`); };
  page.on('console', onConsole); page.on('pageerror', onPageError);
  page.on('requestfailed', onReqFailed); page.on('response', onResp);
  let status = 0; const t0 = Date.now();
  try {
    const resp = await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 45000 });
    status = resp ? resp.status() : 0;
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT_DIR}/${p.name}.png`, fullPage: false });
  } catch (e) {
    errors.push('NAV: ' + String(e).slice(0, 200));
    try { await page.screenshot({ path: `${OUT_DIR}/${p.name}-crash.png` }); } catch {}
  }
  // visible error text detection
  let visibleError = '';
  const bodyText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 2000) : '');
  for (const marker of ['Application error', 'Something went wrong', 'Internal Server Error', 'Unhandled Runtime Error', 'Build Error', 'TypeError', 'Cannot read properties']) {
    if (bodyText.includes(marker)) { visibleError = marker; break; }
  }
  page.off('console', onConsole); page.off('pageerror', onPageError);
  page.off('requestfailed', onReqFailed); page.off('response', onResp);
  results.push({ page: p.path, status, ms: Date.now() - t0, visibleError, pageErrors: errors, consoleErrors: consoleErrors.slice(0, 8), failedRequests: failedRequests.slice(0, 10) });
  console.log(`${p.path} -> ${status} ${Date.now() - t0}ms ${visibleError ? '!! ' + visibleError : ''} pageErr=${errors.length} conErr=${consoleErrors.length} failed=${failedRequests.length}`);
}

console.log('\n===== API CHECKS =====');
for (const a of APIS) {
  try {
    const r = await fetch(BASE + a);
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    const empty = j === null || (Array.isArray(j) && j.length === 0) || (j && typeof j === 'object' && Object.keys(j).length === 0);
    console.log(`${a} -> ${r.status} bytes=${txt.length}${empty && r.status === 200 ? ' (EMPTY JSON)' : ''}`);
  } catch (e) { console.log(`${a} -> FAIL ${String(e).slice(0, 120)}`); }
}

console.log('\n===== DETAILS (pages with problems) =====');
for (const r of results) {
  if (r.pageErrors.length || r.consoleErrors.length || r.failedRequests.length || r.visibleError || r.status >= 400) {
    console.log('\n--- ' + r.page + ' (status ' + r.status + ')');
    if (r.visibleError) console.log('VISIBLE ERROR: ' + r.visibleError);
    r.pageErrors.forEach(e => console.log('PAGEERROR: ' + e));
    r.consoleErrors.forEach(e => console.log('CONSOLE: ' + e));
    r.failedRequests.forEach(e => console.log('NET: ' + e));
  }
}
await browser.close();
