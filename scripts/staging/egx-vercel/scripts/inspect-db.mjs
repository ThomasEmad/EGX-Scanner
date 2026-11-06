import { PrismaClient } from '@prisma/client'
process.env.DATABASE_URL = 'file:C:/Users/tomas/Downloads/EGX-Scanner-backup/EGX-Scanner/prisma/dev.db'
const db = new PrismaClient({ log: [] })
async function main() {
  try {
    console.log('=== COMPANIES ===')
    const totalCompanies = await db.company.count()
    const demoCompanies = await db.company.count({ where: { isDemoData: true } })
    const realCompanies = await db.company.count({ where: { isDemoData: false } })
    const active = await db.company.count({ where: { isActive: true } })
    console.log('total:', totalCompanies, 'demo:', demoCompanies, 'real:', realCompanies, 'active:', active)
    const sectors = await db.company.groupBy({ by: ['sector'], _count: { sector: true }, orderBy: { _count: { sector: 'desc' } } })
    console.log('sectors:', JSON.stringify(sectors))
  } catch (e) { console.error('ERROR companies:', e) } finally { await db.$disconnect() }
}
main()