import { db } from "@/lib/db"
import type { Company, Prisma } from "@prisma/client"

/**
 * Resolve the `[id]` route param to a company — accepts company id (cuid),
 * ticker or ISIN. All `/api/v1/companies/[id]/*` endpoints must use this so
 * ticker deep-links (the sitemap URL format: /company/<TICKER>) work
 * consistently across the whole API surface.
 *
 * CUIDs are lower-case and case-sensitive; only upper-case the ticker/ISIN
 * lookup keys. Upper-casing the id made /companies/<cuid>/confidence 404.
 */
/** The resolved company always carries `id` (default select) — callers rely on it. */
export type CompanyRef = Partial<Company> & { id: string }

export async function findCompanyByKey(
  key: string,
  select?: Prisma.CompanySelect,
): Promise<CompanyRef | null> {
  const raw = decodeURIComponent(key)
  const upper = raw.toUpperCase()
  return db.company.findFirst({
    where: { OR: [{ id: raw }, { ticker: upper }, { isin: upper }] },
    select: (select ?? { id: true }) as Prisma.CompanySelect,
  })
}
