// Test bulk write paths: createMany / upsert / updateMany via libsql adapter
import fs from 'node:fs'
const dbPath = '/tmp/atest.db'
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: `file:${dbPath}` }), log: [] })

await db.setting.createMany({ data: [ { key: 'cm1', value: 'a' }, { key: 'cm2', value: 'b' } ] })
let r = await db.$queryRawUnsafe(`SELECT key, typeof(updatedAt) AS t FROM Setting WHERE key LIKE 'cm%'`)
console.log('CREATE_MANY:', JSON.stringify(r))

await db.setting.upsert({ where: { key: 'up1' }, create: { key: 'up1', value: 'a' }, update: { value: 'a' } })
r = await db.$queryRawUnsafe(`SELECT key, typeof(updatedAt) AS t FROM Setting WHERE key='up1'`)
console.log('UPSERT     :', JSON.stringify(r))

await db.setting.updateMany({ where: { key: 'cm1' }, data: { value: 'z' } })
r = await db.$queryRawUnsafe(`SELECT key, typeof(updatedAt) AS t FROM Setting WHERE key='cm1'`)
console.log('UPDATE_MANY:', JSON.stringify(r))
process.exit(0)
