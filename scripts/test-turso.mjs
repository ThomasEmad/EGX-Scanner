// اختبار سريع لاتصال Turso (قراءة فقط)
import { createClient } from '@libsql/client';

const url = process.env.TU_URL;
const token = process.env.TU_TOKEN;

const db = createClient({ url, authToken: token });

const r1 = await db.execute('SELECT 1 AS ok');
console.log('SELECT 1 →', JSON.stringify(r1.rows));

const tables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
);
const names = tables.rows.map((r) => String(r.name));
console.log('TABLES_COUNT =', names.length);
console.log('TABLES =', names.slice(0, 40).join(', '));

for (const t of ['Company', 'User', 'CalculatedMetric']) {
  if (names.includes(t)) {
    const c = await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
    console.log(`COUNT ${t} =`, String(c.rows[0].n));
  } else {
    console.log(`COUNT ${t} = (no table)`);
  }
}
console.log('TURSO_TEST_DONE');
