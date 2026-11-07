import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { cachedResponse } from "@/lib/public-cache"

// GET /api/v1/search?q=... — fast global company lookup for the header
// search box. Prefix/substring match over indexed ticker + exact-ish name
// match, capped at 8 rows. Cached 60s per query (repeated queries are free).
//
// Response rows are intentionally tiny (id/ticker/names/sector) — the client
// navigates to /company/{ticker} on selection.

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.trim() || ""
  if (q.length < 1 || q.length > 40) {
    return Response.json({ results: [] }, { headers: { "Cache-Control": "public, max-age=30" } })
  }
  return cachedResponse(`search:${q.toLowerCase()}`, 60 * 1000, async () => ({ results: await searchCompanies(q) }))
}

async function searchCompanies(q: string) {
  const like = q.toLowerCase()
  const rows = await db.company.findMany({
    where: {
      isActive: true,
      OR: [
        { ticker: { startsWith: like, mode: "insensitive" } },
        { ticker: { contains: like, mode: "insensitive" } },
        { nameEn: { contains: like, mode: "insensitive" } },
        { nameAr: { contains: q } },
      ],
    },
    select: { id: true, ticker: true, nameEn: true, nameAr: true, sector: true },
    take: 8,
  })
  // ticker-prefix matches first (exact ticker feel), then the rest alphabetically
  return rows.sort((a, b) => {
    const ap = a.ticker.toLowerCase().startsWith(like) ? 0 : 1
    const bp = b.ticker.toLowerCase().startsWith(like) ? 0 : 1
    return ap - bp || a.ticker.localeCompare(b.ticker)
  })
}
