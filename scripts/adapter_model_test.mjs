// Does a Prisma MODEL write via the libsql adapter store DateTime as INTEGER?
import fs from 'node:fs'
const dbPath = '/tmp/atest.db'
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')

const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: `file:${dbPath}` }), log: [] })

await db.setting.create({ data: { key: 'probe', value: 'x' } })
const r = await db.$queryRawUnsafe(`SELECT key, updatedAt, typeof(updatedAt) AS t FROM Setting`)
console.log('MODEL CREATE updatedAt:', JSON.stringify(r))

await db.setting.update({ where: { key: 'probe' }, data: { value: 'y' } })
const r2 = await db.$queryRawUnsafe(`SELECT updatedAt, typeof(updatedAt) AS t FROM Setting`)
console.log('MODEL UPDATE updatedAt:', JSON.stringify(r2))

// explicit Date param
await db.setting.update({ where: { key: 'probe' }, data: { value: 'z', updatedAt: new Date('2025-01-02T03:04:05.678Z') } })
const r3 = await db.$queryRawUnsafe(`SELECT updatedAt, typeof(updatedAt) AS t FROM Setting`)
console.log('EXPLICIT DATE updatedAt:', JSON.stringify(r3))
process.exit(0)
