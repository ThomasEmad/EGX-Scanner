import { DatabaseSync } from 'node:sqlite'
const db = new DatabaseSync('C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/prisma/custom.db')
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()
console.log('TABLES:', JSON.stringify(tables, null, 2))
for (const t of tables) {
  const name = t.name
  try {
    const count = db.prepare(`SELECT COUNT(*) as c FROM "${name}"`).get()
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(name)
    console.log(`\n=== ${name} (${count.c} rows) ===`)
    console.log(schema.sql)
  } catch (e) { console.log(name, 'ERR', e.message) }
}
db.close()
