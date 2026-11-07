import fs from 'node:fs'
const U = fs.readFileSync('/home/z/my-project/scripts/.turso_url','utf8').trim()
const T = fs.readFileSync('/home/z/my-project/scripts/.turso_token','utf8').trim()
const { PrismaClient } = await import('@prisma/client')
const { PrismaLibSQL } = await import('@prisma/adapter-libsql')
const db = new PrismaClient({ adapter: new PrismaLibSQL({ url: U, authToken: T }), log: [] })
try {
  const pc = await db.$queryRawUnsafe(`PRAGMA page_count`)
  const ps = await db.$queryRawUnsafe(`PRAGMA page_size`)
  const fl = await db.$queryRawUnsafe(`PRAGMA freelist_count`)
  const sz = Number(pc[0].page_count) * Number(ps[0].page_size)
  const used = (Number(pc[0].page_count) - Number(fl[0].freelist_count)) * Number(ps[0].page_size)
  console.log(`DB size: ${(sz/1024/1024).toFixed(1)}MB (used: ${(used/1024/1024).toFixed(1)}MB, free pages: ${(Number(fl[0].freelist_count)*Number(ps[0].page_size)/1024/1024).toFixed(1)}MB)`)
  const cm = await db.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM CalculatedMetric`)
  console.log(`CalculatedMetric rows: ${cm[0].n}`)
} catch (e) { console.log('DB ERROR (quota?):', String(e?.message ?? e).slice(0, 300)) }
process.exit(0)
