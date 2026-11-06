// اختبار executeMultiple مع BEGIN/COMMIT على Turso عبر الشبكة
import { createClient } from '@libsql/client';

const db = createClient({ url: process.env.TU_URL, authToken: process.env.TU_TOKEN });

// تنظيف أي بقايا اختبار سابقة
await db.executeMultiple('BEGIN;\nDROP TABLE IF EXISTS __import_test;\nCOMMIT;');

const script = `BEGIN;
CREATE TABLE __import_test (id INTEGER PRIMARY KEY, txt TEXT);
INSERT INTO __import_test VALUES (1, 'نص عربي "مع اقتباسات" و; فاصلة منقوطة');
INSERT INTO __import_test VALUES (2, 'line1
line2');
COMMIT;`;

const t0 = Date.now();
await db.executeMultiple(script);
console.log('executeMultiple ok in', Date.now() - t0, 'ms');

const r = await db.execute('SELECT * FROM __import_test');
console.log('rows =', JSON.stringify(r.rows));

await db.executeMultiple('BEGIN;\nDROP TABLE __import_test;\nCOMMIT;');
console.log('cleanup ok');
console.log('PIPELINE_TEST_DONE');
