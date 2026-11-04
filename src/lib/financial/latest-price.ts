// Picks the freshest dated row per company.
//
// Query results are usually ordered `asOf DESC`, but relying on that order is
// fragile: a `new Map(rows.map(r => [r.companyId, r]))` keeps the LAST duplicate,
// i.e. the OLDEST snapshot when rows are newest-first. This helper compares
// timestamps explicitly so the result is correct for any input order.
export function latestPriceByCompany<T extends { companyId: string; asOf: Date }>(
  rows: readonly T[],
): Map<string, T> {
  const out = new Map<string, T>()
  for (const row of rows) {
    const current = out.get(row.companyId)
    if (!current || row.asOf.getTime() > current.asOf.getTime()) {
      out.set(row.companyId, row)
    }
  }
  return out
}
