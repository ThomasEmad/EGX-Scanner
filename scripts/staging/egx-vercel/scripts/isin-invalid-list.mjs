// List companies whose stored ISIN fails the corrected ISO 6166 Luhn check.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

function isValidISIN(isin) {
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return false
  let digits = ''
  for (const ch of isin.slice(0, 11)) {
    if (/[A-Z]/.test(ch)) digits += (ch.charCodeAt(0) - 55).toString()
    else digits += ch
  }
  let sum = 0, mult = 2
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10) * mult
    if (d > 9) d -= 9
    sum += d
    mult = mult === 2 ? 1 : 2
  }
  return (10 - (sum % 10)) % 10 === parseInt(isin.slice(11), 10)
}

const companies = await db.company.findMany({ select: { ticker: true, isin: true, nameEn: true }, orderBy: { ticker: 'asc' } })
const invalid = companies.filter(c => c.isin && !isValidISIN(c.isin))
console.log('INVALID ISIN (' + invalid.length + '):')
for (const c of invalid) console.log(`${c.ticker}\t${c.isin}\t${c.nameEn}`)
await db.$disconnect()
