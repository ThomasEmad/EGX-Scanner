// رفع chunks إلى Turso مع استكمال تلقائي + إعادة محاولة + تحقق نهائي
// الاستخدام: node import-turso.mjs <chunksDir> <url> <token>
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@libsql/client';

const [, , chunksDir, url, token] = process.argv;
const manifest = JSON.parse(readFileSync(join(chunksDir, 'manifest.json'), 'utf8'));
const progressFile = join(chunksDir, 'progress.json');
const logFile = join(chunksDir, 'import.log');

const log = (msg) => {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(logFile, line + '\n');
};

let done = 0;
if (existsSync(progressFile)) {
  try { done = JSON.parse(readFileSync(progressFile, 'utf8')).done || 0; } catch {}
}
log(`IMPORT_START total_chunks=${manifest.chunks.length} resume_from=${done}`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// إعادة إنشاء الاتصال دورياً: مكتبة libsql تحتفظ بنتائج الطلبات في الذاكرة
// وتتضخم حتى OOM — التجديد كل 20 chunk يحررها
let db = createClient({ url, authToken: token });
const RENEW_EVERY = 20;
async function renewClient(reason) {
  try { await db.close(); } catch {}
  db = createClient({ url, authToken: token });
  if (global.gc) global.gc();
  log(`client renewed (${reason}) rss=${Math.round(process.memoryUsage().rss / 1048576)}MB`);
}

for (let i = done; i < manifest.chunks.length; i++) {
  if (i > done && i % RENEW_EVERY === 0) {
    await renewClient('every-20');
  }
  const c = manifest.chunks[i];
  const sql = readFileSync(join(chunksDir, c.file), 'utf8');
  let ok = false;
  let lastErr = null;
  for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
    const t0 = Date.now();
    try {
      await db.executeMultiple(sql);
      ok = true;
      const rss = Math.round(process.memoryUsage().rss / 1048576);
      log(`chunk ${i + 1}/${manifest.chunks.length} OK ${Date.now() - t0}ms stmts=${c.stmts} bytes=${c.bytes} rss=${rss}MB`);
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || e);
      log(`chunk ${i + 1} attempt ${attempt} FAILED: ${msg.slice(0, 300)}`);

      // حالة خاصة: الـ UNIQUE constraint قد تعني أن chunk سابقة اتحفظت على
      // السيرفر لكن العملية ماتت قبل استلام الرد (at-least-once).
      // نتحقق: أول صف INSERT في الـ chunk موجود فعلاً؟ → نعتبرها متسجلة.
      if (/UNIQUE constraint/i.test(msg)) {
        const m = sql.match(/INSERT\s+INTO\s+"([^"]+)"\s+VALUES\('([^']+)'/);
        if (m) {
          try {
            const probe = await db.execute({
              sql: `SELECT 1 AS x FROM "${m[1]}" WHERE id = ? LIMIT 1`,
              args: [m[2]],
            });
            if (probe.rows.length > 0) {
              log(`chunk ${i + 1} already committed on server (probe ${m[1]}/${m[2]} found) → marking done`);
              ok = true;
            }
          } catch (pe) {
            log(`probe failed: ${String(pe?.message || pe).slice(0, 200)}`);
          }
        }
      }

      if (!ok) {
        // في حال الخطأ موقعه "transaction" متبقية أو اتصال — ننتظر ونحاول تاني
        await sleep(2000 * attempt);
        if (attempt < 3) await renewClient(`after-fail-chunk-${i + 1}`);
      }
    }
  }
  if (!ok) {
    log(`IMPORT_ABORTED at chunk ${i + 1}: ${String(lastErr?.message || lastErr).slice(0, 500)}`);
    process.exit(1);
  }
  writeFileSync(progressFile, JSON.stringify({ done: i + 1 }));
}

log('ALL_CHUNKS_DONE — verifying counts…');

const expected = {
  Company: 297,
  CalculatedMetric: 496071,
  FinancialValue: 283950,
  MarketPrice: 12682,
  User: 10,
};
const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
);
const names = tables.rows.map((r) => String(r.name));
log(`tables = ${names.length}`);
let allOk = true;
for (const [t, exp] of Object.entries(expected)) {
  if (!names.includes(t)) { log(`VERIFY ${t}: MISSING TABLE ❌`); allOk = false; continue; }
  const r = await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
  const got = Number(r.rows[0].n);
  const mark = got === exp ? 'OK' : '❌';
  log(`VERIFY ${t}: got=${got} expected=${exp} ${mark}`);
  if (got !== exp) allOk = false;
}
for (const t of names) {
  if (!(t in expected)) {
    const r = await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
    log(`VERIFY (extra) ${t}: ${Number(r.rows[0].n)}`);
  }
}
log(allOk ? 'IMPORT_SUCCESS 🎉' : 'IMPORT_FINISHED_WITH_DIFFERENCES');
// إرجاع foreign_keys مفعّل بعد انتهاء الرفع (كان معطلاً لكل chunk أثناء الاستيراد)
try {
  await db.execute('PRAGMA foreign_keys=ON');
  const fk = await db.execute('PRAGMA foreign_keys');
  log(`FK restored = ${JSON.stringify(fk.rows)}`);
} catch (e) {
  log(`FK restore failed: ${String(e?.message || e).slice(0, 200)}`);
}
