import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/prisma/dev.db')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log('NUM TABLES:', tables.length)
console.log('TABLES:', JSON.stringify(tables.map(t => t.name), null, 2))
for (const t of tables.slice(0, 10)) {
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${t.name}"`).get()
    console.log(`  ${t.name}: ${count.c} rows`)
  } catch (e) { console.log(`  ${t.name}: ERR ${e.message}`) }
}
db.close()
