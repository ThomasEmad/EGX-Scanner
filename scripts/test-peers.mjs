const ids = { COMI: "cmuexbjtt001sbxn8bbpnblsn", FWRY: "cmugriqj20013bx50vco6k0sm", UNIT: "cmui726t3005xbx90f8btgbfc", MBSC: "cmui7267a003mbx90y8or1rmm" }
for (const [t, id] of Object.entries(ids)) {
  const r = await fetch(`http://localhost:3000/api/v1/companies/${id}/peers?basis=latest`)
  const j = await r.json()
  console.log(`\n=== ${t} status=${r.status} sector=${j.sector} peers=${j.peers?.length} medians=${JSON.stringify(j.medians)}`)
  if (j.peers) {
    const rows = j.peers.filter(p => p.values.roe !== null).slice(0, 8)
    for (const p of rows) console.log(`${p.ticker}${p.isSelf?"*":""} roe=${p.values.roe?.toFixed(2)} period=${p.periods.roe?.label} (${p.periods.roe?.type}) np=${p.values.net_profit} npPeriod=${p.periods.net_profit?.label}`)
  }
}
