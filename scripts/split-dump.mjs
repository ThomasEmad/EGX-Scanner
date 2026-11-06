// تقسيم dump إلى chunks جاهزة للإرسال — آمن للنصوص التي تحتوي أسطر جديدة و; داخل اقتباسات
// الاستخدام: node split-dump.mjs <dump.sql.gz> <outDir> <chunkBytes>
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';

const [, , gzPath, outDirArg, chunkArg] = process.argv;
const outDir = outDirArg || '/tmp/egx-chunks';
const CHUNK = Number(chunkArg || 2 * 1024 * 1024); // 2MB

console.time('gunzip');
const sql = gunzipSync(readFileSync(gzPath)).toString('utf8');
console.timeEnd('gunzip');
console.log('uncompressed chars =', sql.length);

// مسح Quote-aware وتقسيم على ; خارج الاقتباسات
console.time('split');
const statements = [];
let start = 0;
let inS = false, inD = false, inLineC = false, inBlockC = false;
const n = sql.length;
for (let i = 0; i < n; i++) {
  const c = sql[i];
  if (inLineC) { if (c === '\n') inLineC = false; continue; }
  if (inBlockC) { if (c === '*' && sql[i + 1] === '/') { inBlockC = false; i++; } continue; }
  if (inS) {
    if (c === "'") {
      if (sql[i + 1] === "'") { i++; continue; }
      inS = false;
    }
    continue;
  }
  if (inD) {
    if (c === '"') {
      if (sql[i + 1] === '"') { i++; continue; }
      inD = false;
    }
    continue;
  }
  if (c === "'") { inS = true; continue; }
  if (c === '"') { inD = true; continue; }
  if (c === '-' && sql[i + 1] === '-') { inLineC = true; i++; continue; }
  if (c === '/' && sql[i + 1] === '*') { inBlockC = true; i++; continue; }
  if (c === ';') {
    const s = sql.slice(start, i).trim();
    if (s) statements.push(s);
    start = i + 1;
  }
}
const tail = sql.slice(start).trim();
if (tail) statements.push(tail);
console.timeEnd('split');
console.log('statements =', statements.length);

// استبعاد BEGIN TRANSACTION وCOMMIT الخارجية (هنعمل transactions لكل chunk بنفسنا)
const filtered = statements.filter(
  (s) => !/^BEGIN\s+(TRANSACTION|DEFERRED|IMMEDIATE|EXCLUSIVE)?\s*$/i.test(s) && !/^COMMIT\s*;?$/i.test(s) && !/^PRAGMA\s+foreign_keys/i.test(s)
);
console.log('after filtering BEGIN/COMMIT/PRAGMA =', filtered.length);

// إعادة الترتيب: CREATE TABLE أولاً ← INSERT ← الفهارس/المتفرقات آخراً
// (Turso يفعّل foreign_keys افتراضياً — لازم الجداول تتعمل قبل أي إدراج)
const createTables = [], inserts = [], others = [];
for (const s of filtered) {
  if (/^CREATE\s+TABLE/i.test(s)) createTables.push(s);
  else if (/^INSERT\s+INTO/i.test(s)) inserts.push(s);
  else others.push(s);
}
console.log(`buckets: createTables=${createTables.length} inserts=${inserts.length} others=${others.length}`);
const ordered = [...createTables, ...inserts, ...others];

mkdirSync(outDir, { recursive: true });
const manifest = { chunkBytes: CHUNK, chunks: [] };
let idx = 0, size = 0, cur = [];
for (const s of ordered) {
  cur.push(s);
  size += s.length + 2;
  if (size >= CHUNK) {
    const body = cur.join(';\n');
    const file = `chunk-${String(idx).padStart(5, '0')}.sql`;
    writeFileSync(join(outDir, file), 'PRAGMA foreign_keys=OFF;\nBEGIN;\n' + body + ';\nCOMMIT;');
    manifest.chunks.push({ file, bytes: body.length + 16, stmts: cur.length });
    idx++; size = 0; cur = [];
  }
}
if (cur.length) {
  const body = cur.join(';\n');
  const file = `chunk-${String(idx).padStart(5, '0')}.sql`;
  writeFileSync(join(outDir, file), 'PRAGMA foreign_keys=OFF;\nBEGIN;\n' + body + ';\nCOMMIT;');
  manifest.chunks.push({ file, bytes: body.length + 16, stmts: cur.length });
  idx++;
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('chunks =', manifest.chunks.length);
console.log('total stmts =', manifest.chunks.reduce((a, c) => a + c.stmts, 0));
console.log('total bytes =', manifest.chunks.reduce((a, c) => a + c.bytes, 0));
console.log('SPLIT_DONE');
