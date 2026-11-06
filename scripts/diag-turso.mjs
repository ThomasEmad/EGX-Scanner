// تشخيص: حالة FK + الجداول الموجودة + تنظيف أي transaction معلقة
import { createClient } from '@libsql/client';

const db = createClient({ url: process.env.TU_URL, authToken: process.env.TU_TOKEN });

const fk = await db.execute('PRAGMA foreign_keys');
console.log('foreign_keys state =', JSON.stringify(fk.rows));

const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
);
console.log('tables now =', tables.rows.length, JSON.stringify(tables.rows.map((r) => String(r.name)).slice(0, 15)));

// تنظيف أي معاملة متشعلة من محاولة سابقة فاشلة
for (const stmt of ['COMMIT', 'ROLLBACK']) {
  try {
    await db.execute(stmt);
    console.log(`dangling ${stmt} executed`);
  } catch (e) {
    console.log(`${stmt}: ${String(e?.message || e).slice(0, 80)}`);
  }
}
console.log('DIAG_DONE');
