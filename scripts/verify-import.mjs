// تحقق نهائي شامل: عدد الإدراجات في الـ dump مقابل العدد الفعلي في Turso لكل الجداول
import { readFileSync } from 'node:fs';
import { createClient } from '@libsql/client';
import { gunzipSync } from 'node:zlib';

const sql = gunzipSync(readFileSync(process.argv[2])).toString('utf8');
const db = createClient({ url: process.env.TU_URL, authToken: process.env.TU_TOKEN });

// عدّ INSERTs لكل جدول في الـ dump (سريع: مسح نصي بعد التقسيم على ; خارج الاقتباسات يعقّد الأمر،
// لكن INSERT INTO "X" VALUES تظهر مرة واحدة لكل صف لأن المحتوى قد يحتوي النص نفسه؟ نستخدم نفس منطق التقسيم المبسط)
// نستخدم فحص بداية الجملة الفعلي: نقسم مثل split-dump.mjs
function splitStatements(text) {
  const stmts = [];
  let start = 0, inS = false, inD = false, inLC = false, inBC = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inLC) { if (c === '\n') inLC = false; continue; }
    if (inBC) { if (c === '*' && text[i + 1] === '/') { inBC = false; i++; } continue; }
    if (inS) { if (c === "'") { if (text[i + 1] === "'") { i++; continue; } inS = false; } continue; }
    if (inD) { if (c === '"') { if (text[i + 1] === '"') { i++; continue; } inD = false; } continue; }
    if (c === "'") { inS = true; continue; }
    if (c === '"') { inD = true; continue; }
    if (c === '-' && text[i + 1] === '-') { inLC = true; i++; continue; }
    if (c === '/' && text[i + 1] === '*') { inBC = true; i++; continue; }
    if (c === ';') { const s = text.slice(start, i).trim(); if (s) stmts.push(s); start = i + 1; }
  }
  return stmts;
}

console.time('scan dump');
const dumpCounts = {};
const tablesInDump = new Set();
const schemaOrder = [];
for (const s of splitStatements(sql)) {
  let m = s.match(/^CREATE\s+TABLE\s+"([^"]+)"/);
  if (m) { tablesInDump.add(m[1]); schemaOrder.push(m[1]); continue; }
  m = s.match(/^INSERT\s+INTO\s+"([^"]+)"/);
  if (m) dumpCounts[m[1]] = (dumpCounts[m[1]] || 0) + 1;
}
console.timeEnd('scan dump');
console.log('tables in dump =', tablesInDump.size);

const dbTables = await db.execute(
  "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
);
const dbNames = dbTables.rows.map((r) => String(r.name));
console.log('tables in turso =', dbNames.length);

let mismatches = 0;
for (const t of [...tablesInDump].sort()) {
  const expected = dumpCounts[t] || 0;
  let got = 'MISSING';
  if (dbNames.includes(t)) {
    const r = await db.execute(`SELECT COUNT(*) AS n FROM "${t}"`);
    got = Number(r.rows[0].n);
  }
  const ok = got === expected;
  if (!ok) { mismatches++; console.log(`❌ ${t}: dump=${expected} turso=${got}`); }
  else console.log(`✅ ${t}: ${got}`);
}
console.log(mismatches === 0 ? 'FULL_VERIFICATION_PASSED 🎉' : `MISMATCHES=${mismatches}`);
