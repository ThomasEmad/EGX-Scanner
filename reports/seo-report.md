# تقرير SEO — EGX Scanner / SEO Report

**التاريخ / Date:** 2026-11-03  
**النطاق / Scope:** الموقع العام القابل للفهرسة / public, indexable surface  
**المنهج / Method:** white-hat only — no doorway pages, no fake reviews, no auto-generated valueless content, no hidden text, no paid links.

---

## 1. الملخص التنفيذي / Executive summary

The public site now has a coherent, crawlable structure: one canonical URL per company (ticker, not database id), server-rendered sector pages, per-page metadata, a sitemap generated from the database, and explicit `noindex` rules for private/transactional pages. Every indexable page contains real data or real product information; pages with no trusted data are kept reachable but excluded from indexing until data exists.

الموقع العام أصبح له هيكل واضح: رابط canonical واحد لكل شركة باستخدام رمز التداول بدلاً من معرّف قاعدة البيانات، صفحات قطاعات مُولّدة على الخادم، بيانات وصفية لكل صفحة، خريطة موقع من قاعدة البيانات، وقواعد `noindex` صريحة للصفحات الخاصة. الصفحات التي لا تحتوي بيانات موثوقة تبقى قابلة للوصول لكنها تُستبعد من الفهرسة حتى تتوفر البيانات.

---

## 2. Technical SEO — what was implemented

| Area | Implementation | Verification |
|---|---|---|
| Canonical host | `metadataBase` from `siteConfig.url` (`NEXT_PUBLIC_SITE_URL`, default `https://egx-scanner.com`) | Canonical on `/` = `https://egx-scanner.com/` |
| Canonical per page | Removed the global canonical from the root layout; each page sets its own `alternates.canonical` | Home, company, sector, rankings, data-quality, about all carry the correct self-canonical |
| Company URLs | `/company/[ticker]`; the route also resolves ISIN and cuid and redirects metadata/canonical/JSON-LD/sitemap to the ticker URL | `/company/COMI` 200; canonical `/company/COMI`; zero cuid URLs in the sitemap |
| Sitemap | Database-driven; only active companies with ≥1 trusted value, populated sectors, and indexable static pages | See §4 |
| Robots | Public pages allowed; `/admin/`, `/api/`, auth pages, dashboard, watchlist, portfolio, company report disallowed | `robots.txt` verified |
| Metadata | Unique title + description + Open Graph + Twitter card per public page | Titles/descriptions inspected in HTML |
| Structured data | `Organization` + `WebSite` (root), `FAQPage` (home, mirrors visible FAQ), `Corporation` + `BreadcrumbList` (company), `BreadcrumbList` + `ItemList` (sector pages) | JSON-LD present and valid shapes |
| Social assets | Static `og-image.png` (1200×630) and `logo.png` (512) generated at build time; no runtime image generation | `/og-image.png`, `/logo.png` 200 |
| Manifest | `manifest.webmanifest` with name, icons, theme, display | 200 |
| SSR / crawlability | Sector index and sector detail are server-rendered; client pages are wrapped by server components that export metadata | HTML contains content without JS |
| Internal links | Header nav: Companies, Rankings, Sectors, Scanners, Undervalued, Data quality, About; footer links to all public pages | Rendered header/footer inspected |
| Thin-content control | Company pages with no trusted value are `noindex, follow` and excluded from the sitemap | Rule implemented in `generateMetadata` and `sitemap.ts` |
| Private pages | `/dashboard`, `/watchlist`, `/portfolio`, `/compare` are `noindex, follow` | Meta robots inspected |
| Language | Bilingual AR/EN with `lang`/`dir`; metadata in English with Arabic keywords | HTML lang/dir verified |

---

## 3. Content and trust signals

- The landing page no longer shows fabricated fallback statistics or unverified company highlights. When the API is unavailable, counters render `—`.
- The FAQ is visible content and is mirrored in `FAQPage` JSON-LD; it does not claim “100% audited” or “official”.
- User-visible data-provider names and per-cell source/provenance dialogs were removed. The product still keeps an internal audit trail, but the public copy describes *what is checked* (period, accounting identity, scale) rather than *who supplied it*.
- The About page reports real database counts with `—` fallbacks and links to the data-quality page.
- No investment advice, no price targets, no “guaranteed” language. Fair-value output is labelled arithmetic from stated criteria, and extreme gaps are marked for review.

---

## 4. Verification (measured)

| Check | Result |
|---|---|
| Public pages returning 200 | `/`, `/sectors`, `/sectors/Banks`, `/company/COMI`, `/company/SIPC`, `/rankings`, `/undervalued`, `/data-quality`, `/about`, `/premium`, `/disclaimer`, `/terms`, `/privacy` |
| Private pages returning 200 with `noindex` | `/dashboard`, `/compare`, `/watchlist`, `/portfolio` |
| Sitemap URLs | 302 measured after thin-page filtering: 274 company + 18 sector + 10 static |
| Sitemap company URLs using ticker | 100% (0 cuid-like URLs) |
| Company canonical | `https://egx-scanner.com/company/COMI` |
| Sector canonical | `https://egx-scanner.com/sectors/Banks` |
| Home canonical | `https://egx-scanner.com/` |
| Robots | `Allow: /`; private paths disallowed; `Host` + `Sitemap` present |
| OG image | 1200×630 PNG, 200 |
| Logo | 512×512 PNG, 200 |
| Manifest | 200, valid JSON |

> The exact sitemap count is re-verified after the final build in `reports/final-verification.txt`.

---

## 5. Remaining SEO risks / gaps

1. **Thin company pages.** 8 active companies have no trusted values; they are now `noindex` and excluded from the sitemap. This is correct but means the addressable company universe is 274, not 282, until data is recovered.
2. **No editorial content per company.** Pages are data-rich but not narrative-rich. Adding unique, factual company summaries (business description, sector context) would improve long-tail coverage, but only if sourced and reviewed; do not auto-generate filler.
3. **Arabic metadata.** Titles/descriptions are English-first. Arabic SERP snippets rely on the visible Arabic content and `hreflang` is not yet implemented. If Arabic search is a priority, add `hreflang` (`ar-EG` / `en`) with equivalent URLs.
4. **No backlink/authority program.** White-hat link acquisition (EGX directories, research communities, data-journalism citations) is a marketing task, not a code task.
5. **Sitemap freshness.** `revalidate = 3600`; new companies/data appear within an hour after a rebuild or revalidation. A deploy hook or cron ping to search consoles is recommended.
6. **No Search Console / Bing verification** in the repository. Add the verification tokens via env-driven metadata before launch.
7. **Structured data coverage.** `Corporation` is used for company pages; `Dataset`/`FinancialProduct` markup is intentionally not used because the data is not a public dataset feed and claiming it could be misleading.

---

## 6. White-hat compliance statement

- No cloaking, doorway pages, hidden text, keyword stuffing, or link schemes.
- No fake reviews, ratings, or “as seen in” claims.
- No auto-generated pages whose only purpose is to capture search traffic; every page maps to a real company, sector, or product function.
- `noindex` is used for private/thin pages instead of misleading canonical tricks.
- Data-quality and disclaimer pages are public and linkable, so users can verify limitations.

---

## 7. Arabic summary / ملخص عربي

- تم تثبيت canonical لكل صفحة، واستخدام رمز التداول في روابط الشركات بدلاً من cuid.
- خريطة الموقع تُبنى من قاعدة البيانات وتستبعد الصفحات الرفيعة (بلا بيانات موثوقة) والصفحات الخاصة.
- الصفحات الخاصة (لوحة التحكم، المقارنة، المتابعة، المحفظة) تحمل `noindex`.
- تمت إزالة أسماء مزوّدي البيانات من واجهة المستخدم؛ بقي التدقيق الداخلي فقط.
- لا يوجد محتوى مزيّف أو حشو كلمات أو صفحات بوابة. الصفحات الرفيعة تُستبعد من الفهرسة ولا تُحذف.
- المتبقي: محتوى تحريري فريد لكل شركة، وhreflang عربي، والتحقق من Search Console، وبرنامج روابط أخلاقي.
