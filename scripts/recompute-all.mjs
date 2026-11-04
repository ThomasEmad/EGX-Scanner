import { recomputeAll } from '../src/lib/financial/recompute'

async function main() {
  try {
    console.log('Running recomputeAll() for all active companies...')
    const results = await recomputeAll()
    let totalCalc = 0, totalEvents = 0
    for (const r of results) {
      totalCalc += r.calculatedMetrics
      totalEvents += r.events.length
      if (r.calculatedMetrics > 0 || r.events.length > 0) {
        console.log(`  ${r.companyId}: ${r.calculatedMetrics} calc metrics, ${r.events.length} events, stmtType=${r.preferredStatementType}`)
      }
    }
    console.log(`\nTOTAL: ${results.length} companies processed, ${totalCalc} calculated metrics, ${totalEvents} events`)
  } catch (e) {
    console.error('ERROR:', e)
  }
}
main()