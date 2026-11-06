import { chromium } from 'playwright';

const browser = await chromium.launch();
const page = await browser.newPage();
const msgs = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) msgs.push(`[${m.type()}] ${m.text()}`.slice(0, 2000)); });
page.on('pageerror', e => msgs.push('[pageerror] ' + String(e).slice(0, 3000)));
await page.goto('http://localhost:3001/premium', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2500);
console.log(msgs.filter(m => m.includes('418') || m.includes('ydration') || m.includes('pageerror')).join('\n\n') || 'NO HYDRATION ERRORS');
await browser.close();
