// Check report conventions: reportType / processingStatus / extractionMethod values
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const rt = await db.financialReport.groupBy({ by: ['reportType'], _count: { id: true } })
const ps = await db.financialReport.groupBy({ by: ['processingStatus'], _count: { id: true } })
const em = await db.financialReport.groupBy({ by: ['extractionMethod'], _count: { id: true } })
const askbora = await db.financialReport.findFirst({ where: { sourceName: { contains: 'ASKBORA' } }, select: { reportType: true, processingStatus: true, extractionMethod: true, sourceUrl: true, periodLabel: true } })
console.log('reportType:', rt.map(r => r.reportType + '=' + r._count.id).join(', '))
console.log('processingStatus:', ps.map(r => r.processingStatus + '=' + r._count.id).join(', '))
console.log('extractionMethod:', em.map(r => r.extractionMethod + '=' + r._count.id).join(', '))
console.log('sample ASKBORA report:', JSON.stringify(askbora))
await db.$disconnect()
