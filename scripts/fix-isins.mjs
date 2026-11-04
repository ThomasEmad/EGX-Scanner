// Update the 30 verified ISINs (Mubasher live pages + TradingView symbol pages,
// all passing ISO 6166 Luhn). Dry run by default; --execute to write.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

// Sources: "mubasher" = mubasher.info/markets/EGX/stocks/<TICKER> (2026-10-28),
//          "tv" = tradingview.com/symbols/EGX-<TICKER>/ (2026-10-28)
const verified = [
  ['ADIB', 'EGS60111C019', 'mubasher'],
  ['AMER', 'EGS675S1C011', 'mubasher'],
  ['CIEB', 'EGS60041C018', 'mubasher'],
  ['CIRA', 'EGS65541C012', 'mubasher'],
  ['CLHO', 'EGS729J1C018', 'mubasher'],
  ['EAST', 'EGS37091C013', 'mubasher'],
  ['EGBE', 'EGS60182C010', 'mubasher'],
  ['ETEL', 'EGS48031C016', 'mubasher'],
  ['HDBK', 'EGS60301C016', 'mubasher'],
  ['ISPH', 'EGS512O1C012', 'mubasher'],
  ['JUFO', 'EGS30901C010', 'mubasher'],
  ['MASR', 'EGS65571C019', 'mubasher'],
  ['MFPC', 'EGS39061C014', 'mubasher'],
  ['ORHD', 'EGS70321C012', 'mubasher'],
  ['PHDC', 'EGS655L1C012', 'mubasher'],
  ['QNBE', 'EGS60081C014', 'mubasher'],
  ['RMDA', 'EGS381B1C015', 'mubasher'],
  ['SAIB', 'EGS60142C014', 'mubasher'],
  ['SUGR', 'EGS30201C015', 'mubasher'],
  ['SWDY', 'EGS3G0Z1C014', 'mubasher'],
  ['TMGH', 'EGS691S1C011', 'mubasher'],
  ['ABUK', 'EGS38191C010', 'tv'],
  ['AMOC', 'EGS380P1C010', 'tv'],
  ['CCAP', 'EGS73541C012', 'tv'],
  ['EGAL', 'EGS3E181C010', 'tv'],
  ['FWRY', 'EGS745L1C014', 'tv'],
  ['HRHO', 'EGS69101C011', 'tv'],
  ['OCDI', 'EGS65851C015', 'tv'],
  ['ORWE', 'EGS33041C012', 'tv'],
  ['SKPC', 'EGS380S1C017', 'tv'],
]

function luhn(i) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(i)) return false
  let d = ''
  for (const c of i.slice(0, 11)) d += /[A-Z]/.test(c) ? (c.charCodeAt(0) - 55).toString() : c
  let s = 0, m = 2
  for (let k = d.length - 1; k >= 0; k--) { let v = parseInt(d[k], 10) * m; if (v > 9) v -= 9; s += v; m = m === 2 ? 1 : 2 }
  return (10 - (s % 10)) % 10 === parseInt(i.slice(11), 10)
}

const EXECUTE = process.argv.includes('--execute')
let updated = 0, changed = 0
for (const [ticker, isin, src] of verified) {
  if (!luhn(isin)) { console.log('SKIP (luhn fail):', ticker, isin); continue }
  const c = await db.company.findUnique({ where: { ticker }, select: { id: true, isin: true } })
  if (!c) { console.log('NO COMPANY:', ticker); continue }
  if (c.isin === isin) { updated++; continue }
  if (!EXECUTE) { changed++; console.log(`[dry] ${ticker}: ${c.isin} -> ${isin} (${src})`); continue }
  await db.company.update({ where: { ticker }, data: { isin } })
  updated++
  changed++
}
console.log(JSON.stringify({ mode: EXECUTE ? 'EXECUTE' : 'DRY', updated, changedOf: changed }))
await db.$disconnect()
