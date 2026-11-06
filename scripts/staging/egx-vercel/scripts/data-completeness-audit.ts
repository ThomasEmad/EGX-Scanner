// Read-only data-completeness baseline.
//
//   npx tsx scripts/data-completeness-audit.ts
//
// Writes:
//   reports/data-completeness-baseline.json
//   reports/data-completeness-baseline.md
//
// This is a measurement tool, not a data mutator. It never fills a NULL or
// changes a value. Recovery scripts must be separate, dry-run-first, and
// reversible.
import { mkdirSync, writeFileSync } from "node:fs"
import { computeCompletenessReport, type CompletenessReport } from "../src/lib/data-quality/completeness"

function pct(c: { pct: number | null }): string {
  return c.pct === null ? "—" : `${c.pct.toFixed(1)}%`
}

function listOrDash(items: string[], max = 25): string {
  if (items.length === 0) return "—"
  const shown = items.slice(0, max).join(", ")
  return items.length > max ? `${shown} … (+${items.length - max})` : shown
}

function markdown(r: CompletenessReport): string {
  const lowCoverage = [...r.fieldCoverage]
    .filter((f) => f.applicableCompanies > 0 && f.valuesTotal > 0)
    .sort((a, b) => (a.anyCoverage.pct ?? 101) - (b.anyCoverage.pct ?? 101))
    .slice(0, 30)
  const annualLow = [...r.fieldCoverage]
    .filter((f) => f.applicableCompanies > 0 && f.valuesTotal > 0)
    .sort((a, b) => (a.latestAnnualCoverage.pct ?? 101) - (b.latestAnnualCoverage.pct ?? 101))
    .slice(0, 20)

  return `# تقرير خط الأساس لاكتمال البيانات / Data Completeness Baseline

**التاريخ / Date:** ${r.generatedAt.slice(0, 10)}  
**هذا تقرير قياس بيانات فقط — ليس توصية استثمارية. / This is a data measurement report, not investment advice.**

---

## 1. النطاق / Universe

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي الشركات / Companies total | ${r.universe.companiesTotal} |
| النشطة / Active | ${r.universe.companiesActive} |
| غير النشطة / Inactive | ${r.universe.companiesInactive} |
| القطاعات / Sectors | ${Object.keys(r.universe.sectors).length} |

## 2. بيانات الشركات / Company metadata

| الحقل / Field | التغطية / Coverage |
|---|---:|
| ISIN | ${pct(r.metadata.isin)} (${r.metadata.isin.numerator}/${r.metadata.isin.denominator}) |
| Shares outstanding | ${pct(r.metadata.sharesOutstanding)} |
| Website | ${pct(r.metadata.website)} |
| EGX category | ${pct(r.metadata.egxCategory)} |
| Source URL | ${pct(r.metadata.sourceUrl)} |
| IR URL | ${pct(r.metadata.irUrl)} |
| Last verified | ${pct(r.metadata.lastVerifiedAt)} |

- **ISIN مفقود / Missing ISIN (${r.metadata.missingIsinTickers.length}):** ${listOrDash(r.metadata.missingIsinTickers, 60)}
- **Shares مفقودة / Missing shares (${r.metadata.missingSharesTickers.length}):** ${listOrDash(r.metadata.missingSharesTickers, 40)}

## 3. الإفصاحات / Reports

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي صفوف التقارير / Report rows | ${r.reports.totalRows} |
| موثوقة وغير محذوفة / Trusted, non-deleted | ${r.reports.trustedNonDeleted} |
| محذوفة / Deleted | ${r.reports.deleted} |
| مستقبلية / Future periodEnd | ${r.reports.future} |
| شركات لديها تقرير موثوق / Companies with trusted report | ${r.reports.companiesWithAnyTrusted} |
| شركات لديها تقرير سنوي / Companies with annual report | ${r.reports.annualCompanies} |
| تغطية publicationDate | ${pct(r.reports.publicationDateCoverage)} |
| تغطية sourceUrl | ${pct(r.reports.sourceUrlCoverage)} |

**توزيع أحدث سنة سنوية / Latest annual FY distribution:** ${Object.entries(r.reports.latestAnnualFyDistribution).sort((a, b) => Number(a[0]) - Number(b[0])).map(([y, n]) => `${y}: ${n}`).join(" · ")}

**شركات بلا تقرير موثوق / No trusted report:** ${listOrDash(r.reports.companiesWithNoTrusted, 40)}  
**شركات بلا تقرير سنوي / No annual report:** ${listOrDash(r.reports.companiesWithNoAnnual, 40)}

## 4. القيم / Values

| الحالة / Status | العدد / Count |
|---|---:|
| إجمالي / Total | ${r.values.total} |
| VALID | ${r.values.valid} |
| NEEDS_REVIEW | ${r.values.needsReview} |
| FAILED | ${r.values.failed} |
| PENDING | ${r.values.pending} |
| Authoritative (سياسة النزاهة) | ${r.values.authoritative} |
| Quarantined / غير موثوقة | ${r.values.quarantined} |
| Provenance (page/text/bbox) | ${pct(r.values.provenancePageTextCoverage)} |
| Extraction method | ${pct(r.values.extractionMethodCoverage)} |

> **ملاحظة / Note:** \`VALID\` هو حالة التحقق الخام. \`Authoritative\` يستبعد أيضاً النسخ المرحّلة وبدائل الصفر (سياسة النزاهة)، لذا قد يكون أقل من \`VALID\`. الفرق يظهر داخل \`Quarantined\` وليس كفقدان بيانات.
> \`VALID\` is the raw validation status. \`Authoritative\` additionally excludes carried-forward copies and zero placeholders per the integrity policy, so it can be lower than \`VALID\`; the difference is counted inside \`Quarantined\`, not lost.

## 5. تغطية الحقول / Field coverage

> المقام للقطاعات المالية لا يتطلب الإيرادات التقليدية؛ الحقول غير المنطبقة لا تُحتسب كخطأ.
> Financial-sector denominators do not require conventional revenue; non-applicable fields are not counted as errors.

### أدنى تغطية عبر أي فترة / Lowest coverage, any period

| Metric | Statement | Applicable | Any | Latest annual | Values (V/R/F/P) |
|---|---|---:|---:|---:|---:|
${lowCoverage.map((f) => `| ${f.code} | ${f.statementType} | ${f.applicableCompanies} | ${pct(f.anyCoverage)} | ${pct(f.latestAnnualCoverage)} | ${f.valuesTotal} (${f.valuesValid}/${f.valuesNeedsReview}/${f.valuesFailed}/${f.valuesPending}) |`).join("\n")}

### أدنى تغطية في أحدث تقرير سنوي / Lowest latest-annual coverage

| Metric | Applicable | Latest annual | Any |
|---|---:|---:|---:|
${annualLow.map((f) => `| ${f.code} | ${f.applicableCompanies} | ${pct(f.latestAnnualCoverage)} | ${pct(f.anyCoverage)} |`).join("\n")}

## 6. الحداثة / Freshness

| البند / Item | القيمة / Value |
|---|---:|
| أحدث periodEnd في السوق / Market freshest periodEnd | ${r.freshness.marketFreshestPeriodEnd ?? "—"} |
| شركات لديها فترة / Companies with latest period | ${r.freshness.companiesWithLatestPeriod} |
| متأخرة > 365 يوم / Stale > 365 days | ${r.freshness.companiesStaleOver365Days} |

**أمثلة المتأخرة / Stale examples:** ${listOrDash(r.freshness.staleCompanies.map((c) => `${c.ticker}(${c.latestPeriod ?? "none"}, ${c.ageDays ?? "—"}d)`), 30)}

## 7. بيانات السوق / Market data

| البند / Item | القيمة / Value |
|---|---:|
| إجمالي الملاحظات / Observations | ${r.marketData.totalObservations} |
| شركات لديها سعر / Companies with price | ${r.marketData.companiesWithPrice} |
| شركات بلا سعر / Without price | ${r.marketData.companiesWithoutPrice} |
| حديثة ≤ 7 أيام / Fresh ≤ 7d | ${r.marketData.freshWithin7Days} |
| متأخرة > 7 أيام / Stale > 7d | ${r.marketData.staleOver7Days} |
| Demo | ${r.marketData.demoObservations} |

**المصادر / Sources:** ${Object.entries(r.marketData.sources).map(([s, n]) => `${s}: ${n}`).join(" · ") || "—"}  
**بلا سعر / No price:** ${listOrDash(r.marketData.missingPriceTickers, 40)}  
**أسعار متأخرة / Stale prices:** ${listOrDash(r.marketData.stalePriceTickers, 30)}

## 8. الحسابات / Calculations

| الحالة / Status | العدد / Rows |
|---|---:|
| Total | ${r.calculations.totalRows} |
| OK | ${r.calculations.okRows} |
| DATA_UNAVAILABLE | ${r.calculations.unavailableRows} |
| NOT_APPLICABLE | ${r.calculations.notApplicableRows} |
| NOT_COMPUTABLE | ${r.calculations.notComputableRows} |

**أعلى تغطية حسب الكود / Top codes:** ${r.calculations.topCodes.slice(0, 15).map((c) => `${c.code}:${c.companies}`).join(" · ")}

## 9. التعارضات والتدقيق / Conflicts and audit

| البند / Item | القيمة / Value |
|---|---:|
| NEEDS_REVIEW values | ${r.conflicts.needsReviewValues} |
| FAILED values | ${r.conflicts.failedValues} |
| Audit run | ${r.conflicts.auditRunId ?? "—"} |
| Audit started | ${r.conflicts.auditStartedAt ?? "—"} |

**Severity:** ${Object.entries(r.conflicts.auditSeverity).map(([s, n]) => `${s}: ${n}`).join(" · ") || "—"}  
**Categories:** ${Object.entries(r.conflicts.auditCategories).map(([s, n]) => `${s}: ${n}`).join(" · ") || "—"}

## 10. الفجوات ذات الأولوية / Priority gaps

- شركات بلا تقرير موثوق / No trusted report: **${r.gaps.companiesWithNoTrusted.length}**
- شركات بلا تقرير سنوي / No annual report: **${r.gaps.companiesWithNoAnnual.length}**
- شركات ينقصها مقياس منطبق واحد على الأقل / Missing ≥1 applicable metric: **${r.gaps.companiesMissingAnyApplicableMetric}**
- شركات ينقصها مقياس أساسي / Missing core metric: **${r.gaps.companiesMissingCoreMetrics.length}**
- ISIN مفقود / Missing ISIN: **${r.gaps.missingIsinCount}**
- بلا سعر / No price: **${r.gaps.missingPriceCount}**
- سعر متأخر / Stale price: **${r.gaps.stalePriceCount}**
- فترة متأخرة / Stale period: **${r.gaps.stalePeriodCount}**

### شركات ينقصها مقياس أساسي / Companies missing a core metric

| Ticker | Sector | Latest annual | Missing applicable metrics |
|---|---|---|---|
${r.gaps.companiesMissingCoreMetrics.slice(0, 40).map((c) => `| ${c.ticker} | ${c.sector} | ${c.latestAnnualPeriod ?? "—"} | ${c.missingApplicableMetrics.join(", ")} |`).join("\n")}

---

## المنهجية / Methodology

- القيم “الموثوقة” = \`VALID\` + سياسة النزاهة (لا نسخ مرحّلة، لا صفر بديل على مقاييس لا يصح أن تكون صفراً، لا قيم معزولة).
- التقرير الموثوق = غير محذوف + حالة معالجة ضمن VALIDATED/APPROVED/EXTRACTED + periodEnd ليس مستقبلياً.
- تفضيل consolidated على standalone لكل شركة، دون خلط.
- الحداثة تُقاس من periodEnd وليس من تاريخ الاسترجاع؛ السوق قد يكون مغلقاً.
- المقامات القطاعية: البنوك والشركات المالية لا تُطالب بالإيرادات التقليدية.
- لا يتم تحويل المفقود إلى صفر، ولا تُعد القيم المحجورة “مكتملة”.
`
}

async function main() {
  const t0 = Date.now()
  const report = await computeCompletenessReport()
  mkdirSync("reports", { recursive: true })
  writeFileSync("reports/data-completeness-baseline.json", JSON.stringify(report, null, 2), "utf8")
  writeFileSync("reports/data-completeness-baseline.md", markdown(report), "utf8")

  console.log("=== DATA COMPLETENESS BASELINE ===")
  console.log(`companies: ${report.universe.companiesActive} active / ${report.universe.companiesTotal} total`)
  console.log(`reports: ${report.reports.trustedNonDeleted} trusted, ${report.reports.annualCompanies} companies with annual`)
  console.log(`values: ${report.values.authoritative} authoritative / ${report.values.total} total (${report.values.quarantined} quarantined)`)
  console.log(`metadata ISIN: ${pct(report.metadata.isin)} | shares: ${pct(report.metadata.sharesOutstanding)}`)
  console.log(`market: ${report.marketData.companiesWithPrice} with price, ${report.marketData.staleOver7Days} stale >7d, ${report.marketData.companiesWithoutPrice} missing`)
  console.log(`freshness: ${report.freshness.companiesStaleOver365Days} stale >365d, freshest ${report.freshness.marketFreshestPeriodEnd}`)
  console.log(`gaps: no-trusted=${report.gaps.companiesWithNoTrusted.length}, no-annual=${report.gaps.companiesWithNoAnnual.length}, missing-core=${report.gaps.companiesMissingCoreMetrics.length}, missing-ISIN=${report.gaps.missingIsinCount}`)
  console.log(`audit: ${report.conflicts.auditRunId ?? "none"} ${JSON.stringify(report.conflicts.auditSeverity)}`)
  console.log(`elapsed: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  console.log("wrote reports/data-completeness-baseline.{json,md}")
}

main().catch((e) => { console.error("COMPLETENESS AUDIT FAILED:", e); process.exit(1) })
