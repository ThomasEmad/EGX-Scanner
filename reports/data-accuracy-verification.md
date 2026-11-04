# تقرير التحقق من دقة البيانات / Data Accuracy Verification

**التاريخ / Date:** 2026-10-30  
**آخر تشغيل إعادة حساب / Recompute:** 274 شركة، 265,113 قياساً محسوباً، 4,197 حدثاً، 9,818 فترة (72.4 ثانية).  
**آخر تدقيق / Audit run:** `cmvuar2d60000bxbgnadzyn8a`  
**هذا تقرير بيانات فقط — ليس توصية استثمارية. / This is a data report, not investment advice.**

> **ملاحظة:** الأقسام 2–6 تصف خط أساس 2026-10-29. القسم 9 يضيف حصاد AskBorsa الشامل وتحديث 2026-10-30.  
> **Note:** Sections 2–6 describe the 2026-10-29 baseline. Section 9 adds the comprehensive AskBorsa harvest and the 2026-10-30 update.

---

## 1. الملخص التنفيذي / Executive summary

- تم تصحيح القيم السنوية الأساسية التي كانت تفسد الترتيب: **EAST، EGAL، CANA، SIPC**، بالإضافة إلى **14 تصحيحاً للتدفقات النقدية (13 تشغيلياً + 1 استثماري)** و**TALM FY2025 NCI**.
- تم إصلاح **TTM الملوث بالنسخ السنوي/التراكمي**: أصبحت فترات TTM التي تحتوي أرباعاً مكررة أو أرباعاً تساوي القيمة السنوية تُستبعد تلقائياً (`DATA_UNAVAILABLE`) بدلاً من إنتاج ROE وهمي.
- **أعلى 25 شركة في ترتيب ROE** تم فحصها مقابل AskBorsa/المصادر المتاحة. معظمها مطابق؛ الحالة الوحيدة البارزة هي **ALCN** بسبب parent net profit مقابل total equity (موضحة أدناه).
- **لا توجد مشكلة CRITICAL في قيمة ROE نفسها** لأي من أعلى 25. توجد مشكلتان في ADRI (تغطية إيراد) وMAAL (تدفق نقدي) لكنهما لا تؤثران على قيمة ROE.
- حالة الاعتماد: **89 معتمدة (certified) / 152 مؤقتة (provisional) / 23 تحتاج مراجعة (review_required)**.
- إجمالي نتائج التدقيق: **2,123**؛ منها **56 CRITICAL / 252 HIGH / 695 MEDIUM / 1,120 LOW**.
- مقارنة AskBorsa الأخيرة: **580 MATCH / 52 MISMATCH / 9 KNOWN_SOURCE_ERROR / 16 CLOSE / 6 PARENT_MATCH / 26 CURRENCY_MISMATCH / 42 APP_MISSING**.

---

## 2. ما تم إصلاحه والتحقق منه / Verified corrections

| الشركة / Company | الفترة / Period | القيمة القديمة / Old | القيمة المصححة / Corrected | المصدر / Source |
|---|---|---|---|---|
| EAST | FY2025 | صافي ربح 5.382B؛ إيراد 18.455B؛ مجمل 5.701B | 9.711B؛ 37.382B؛ 12.035B | القوائم السنوية الرسمية + AskBorsa |
| EAST | FY2026 | 4.155B كسنة كاملة | أعيد تصنيفها H1 2026 ووُضعت في الحجر | التقرير النصف سنوي |
| EGAL | FY2025 | 3.123B؛ إيراد 12.882B؛ أصول 31.974B | 10.186B؛ 43.183B؛ 29.337B | القوائم السنوية الرسمية + AskBorsa |
| EGAL | FY2026 | كانت ناقصة | 15.491B؛ إيراد 53.137B؛ أصول 42.553B؛ حقوق 33.892B | StockAnalysis/AskBorsa |
| CANA | FY2025 | 5.652B | 6.421B (6,421.407M) | بيان البنك الرسمي / Reuters |
| CANA | FY2024 | 5.003B | 5.68125B | بيان البنك الرسمي / Reuters |
| SIPC | FY2024 | مطلوبات 1.9598B | 72.09M (`169M − 96.91M`) | ميزانية الشركة + الهوية المحاسبية |
| TALM | FY2025 | فجوة ميزانية 1.375B | أضيف NCI مستنتج 1.375B + إجمالي المطلوبات والحقوق | الهوية: أصول − مطلوبات − حقوق |
| BQDC/IRON | FY2020 | قُسمت خطأً ÷1000 | **تم التراجع بالكامل** | AskBorsa يطبع 2020 بالآلاف؛ قيم التطبيق صحيحة |
| OCDI, ZMID, DSCW, ATQA, ARAB, COSG, EGAS, OLFI, PHDC, UEGC, MIPH | متعدد | إشارة/مقياس تدفق تشغيلي خاطئ | صُححت الإشارة/المقياس ليتطابق مجموع التدفقات مع صافي التغير | AskBorsa + هوية التدفق النقدي |
| ASCM | FY2023 | OCF 26.6M | 266.18M (×10) | AskBorsa + الهوية |
| MAAL | FY2023 | ICF −5.257B | −5.257M (÷1000) | AskBorsa |

ملفات التراجع / Rollback files:

- `reports/annual-contamination-rollback.json`
- `reports/sipc-2024-rollback.json`
- `reports/cashflow-signs-rollback.json`
- `reports/scale-2020-rollback.json`
- `reports/askborsa-mismatch-rollback.json`

### إصلاحات API / API fixes

- `/api/v1/companies/<CUID|ticker|ISIN>/peers` أصبح يحل المعرفات الثلاثة. تم اختباره بـ `EAST` وCUID: نفس النتيجة (31 peer، القطاع Food).
- `/api/v1/companies/<CUID|ticker|ISIN>/confidence` يعيد `score/rating/tier` كاملة (EAST: 100 / high / certified).
- **EAST FY2026**: لا يوجد `ANNUAL:2026` محسوب لصافي الربح؛ التقرير أعيد تصنيفه H1 2026 وقيمته محجورة. أحدث فترة كاملة لـ ROE هي FY2025 (58.13%).

---

## 3. التحقق من أعلى 25 ROE / Top-25 ROE verification

| # | Ticker | القطاع / Sector | ROE | الفترة / Period | التحقق / Verification |
|---:|---|---|---:|---|---|
| 1 | ARCC | Building Materials | 77.13% | FY2025 | تم التحقق من 3.5807B/4.6426B؛ AskBorsa 2024 (495M) standalone وليس سنوياً |
| 2 | MBSC | Building Materials | 76.95% | TTM Q1 2026 | Q2 2025 379M + Q3 1,112.91M + Q4 1,880M + Q1 2026 591M = 3.96291B |
| 3 | CSAG | Transport | 61.00% | FY2025 | AskBorsa 60.71% — مطابق |
| 4 | EAST | Food | 58.13% | FY2025 | AskBorsa 58.14% — مطابق |
| 5 | MPCI | Healthcare | 56.94% | FY2026 | AskBorsa 56.94% — مطابق |
| 6 | AXPH | Healthcare | 55.93% | FY2026 | AskBorsa 55.93% — مطابق |
| 7 | ALCN | Transport | 54.79% | FY2025 | **فرق موضح:** التطبيق يستخدم parent net 5.9208B / total equity 10.807B؛ AskBorsa total/total = 61.33% |
| 8 | MFSC | Trade | 53.73% | FY2026 | AskBorsa 53.73% — مطابق |
| 9 | ABUK | Basic Materials | 53.73% | TTM Q1 2026 | TTM 13.693B / 25.486B؛ الأرباع منفصلة وتجمع إلى السنوي FY2025 |
| 10 | OLFI | Food | 52.79% | FY2025 | AskBorsa 52.72% — مطابق |
| 11 | SCTS | Education | 48.18% | FY2025 | أحدث من AskBorsa (2024: 36.57%)؛ ينتظر مصدر 2025 |
| 12 | ADCI | Healthcare | 45.93% | TTM Q1 2026 | TTM 253.56M / 552M؛ الأرباع منفصلة؛ التسميات الزمنية تحتاج ضبطاً |
| 13 | ISMQ | Basic Materials | 45.82% | FY2026 | AskBorsa 45.82% — مطابق |
| 14 | EGAL | Basic Materials | 45.71% | FY2026 | FY2026 مضاف ومتحقق؛ AskBorsa FY2025 45.55% |
| 15 | FERC | Basic Materials | 45.10% | TTM Q1 2026 | TTM 1.833B / 4.064B؛ الأرباع منفصلة؛ AskBorsa FY2025 56.62% |
| 16 | MCQE | Building Materials | 44.43% | FY2025 | سنوي 2.033B parent / 4.576B؛ أرباع 2025 كانت نسخاً سنوياً واستُبعدت من TTM |
| 17 | EFID | Food | 44.04% | FY2025 | أحدث من AskBorsa (2024: 39.18%)؛ ينتظر مصدر 2025 |
| 18 | HDBK | Banks | 43.88% | FY2025 | 18.681B/42.574B؛ AskBorsa 2024 27.99M خطأ معروف |
| 19 | ADRI | Financial Services | 42.81% | TTM Q4 2025 | TTM 21.366M / 49.91M؛ Q1 8.54M + Q4 12.69M؛ Q3 periodEnd يحتاج تصحيحاً |
| 20 | CPCI | Healthcare | 42.26% | FY2025 | AskBorsa 42.29% — مطابق |
| 21 | MHOT | Travel & Leisure | 41.26% | FY2025 | AskBorsa 41.25% — مطابق |
| 22 | MAAL | Real Estate | 41.08% | FY2025 | AskBorsa 41.80% — قريب |
| 23 | POUL | Food | 39.41% | FY2025 | AskBorsa 38.83% — قريب |
| 24 | WCDF | Food | 39.35% | FY2025 | AskBorsa 39.35% — مطابق |
| 25 | EDFM | Food | 38.39% | FY2026 | AskBorsa 38.39% — مطابق |

### ملاحظة ROE و NCI / ROE and NCI note

سياسة ROE الحالية تستخدم **صافي الربح العائد للمساهمين (parent)** عند توفره، مع **إجمالي حقوق الملكية** في المقام. هذا متحفظ عندما تكون هناك حصة غير مسيطرة كبيرة (NCI)، كما في ALCN. النتيجة ليست خطأ حسابياً، لكنها أقل من ROE الإجمالي (total/total). لتحويلها إلى parent/parent نحتاج **رصيد NCI** من الميزانية، وهو غير متوفر لبعض الشركات. لا يتم تغيير السياسة تلقائياً.

---

## 4. أخطاء AskBorsa المعروفة / Known AskBorsa source errors

تم تسجيلها في `scripts/audit-askborsa-annual.mjs` بحالة `KNOWN_SOURCE_ERROR` حتى لا تُعاد معالجتها كأخطاء تطبيق:

| الحالة | سبب الخطأ | القيمة الصحيحة |
|---|---|---|
| HDBK 2024 net profit | خطأ تحليل: 27.99M | 12.43B FY2024 / 18.68B FY2025 |
| ARCC 2024 net profit | standalone 495M | 1.16B consolidated |
| CANA 2025 net profit | Q4 standalone 1.37B | 6.421B رسمي |
| BQDC 2020 | AskBorsa بالآلاف | 3.235B ربح / 205.4B أصول |
| IRON 2020 | AskBorsa بالآلاف | −983M ربح / 2.83B أصول |

---

## 5. حالات غامضة تنتظر مصدراً ثانياً / Ambiguous cases pending a second source

هذه لم تُعدّل من AskBorsa وحدها، التزاماً بسياسة «لا تصحيح تلقائي للفروق الغامضة»:

| Ticker | التعارض / Conflict | ما نحتاجه |
|---|---|---|
| EFIC | حقوق 6.221B مقابل AskBorsa 3.04B؛ ROE 10.63% مقابل 21.8% محتمل | رصيد NCI / parent equity من الميزانية |
| HELI | FY2024 ربح 761.25M مقابل AskBorsa 2.56B؛ أرباع 2025 نسخ سنوي | القوائم السنوية 2024/2025 |
| DAPH | خسارة −138.4M (Mubasher) مقابل AskBorsa +17.95M | قائمة الدخل السنوية |
| ASPI | خسارة −32.334M وحقوق 2.5168B مقابل +67.93M و566M | تحديد consolidated/standalone + الميزانية |
| ATLC | ربح 122.204M وحقوق 608.7M مقابل 271M و1.43B | الميزانية والقوائم |
| MPRC | ربح 171.832M (Mubasher) مقابل 776M (AskBorsa) | parent/total + الميزانية |
| TAQA | 794.74M مقابل 277M | بند استثنائي/نطاق التقرير |
| HRHO | 5.331B (parent 4.254B) مقابل 945M؛ حقوق 34.059B مقابل 39.37B | NCI + بند استثنائي |
| OFH | 40.966M مقابل −2.98M؛ PBT critical | قائمة الدخل |
| TMGH | 12.769B (parent 9.025B) مقابل 10.72B | parent/total |
| DSCW | FY2023/FY2024 قوائم الدخل متبادلة مقابل AskBorsa؛ FY2025 109.586M مقابل 367M | القوائم السنوية |
| MCRO | لم يُحسم بعد | مصدر ثانٍ |

**ملاحظة:** TTM لهذه الشركات (HELI, MPRC, ATLC, ASPI, DSCW, MCQE) أصبح `DATA_UNAVAILABLE` بعد إصلاح كشف النسخ السنوي، فلا تدخل قيم TTM الملوثة في الترتيب أو المقارنات.

---

## 6. حالة جودة البيانات الحالية / Current data-quality state

| المؤشر / Metric | القيمة |
|---|---:|
| إجمالي النتائج | 2,123 |
| Blocker | 32 |
| Coverage | 583 |
| Advisory | 1,292 |
| Metadata | 231 |
| Critical | 56 |
| High | 252 |
| Medium | 695 |
| Low | 1,120 |
| Certified | 89 |
| Provisional | 152 |
| Review required | 23 |

### التحقق من القطاعات / Sector verification

- تشغيل `node scripts/sync-mubasher-sectors.mjs` (dry run): **288 ticker** من مؤشرات قطاعات Mubasher، **250 من 265** شركة مطابقة، و**0 تغييرات** — أي أن القطاعات الحالية مطابقة لمؤشرات البورصة.
- **15 شركة غير موجودة في مؤشرات Mubasher** وتحتفظ بتصنيف يدوي يحتاج مراجعة: ADRI, AMII, AMPH, DAPH, ECCW, EGAS, GOUR, GROV, IBCT, INEG, NCEM, NOAF, TAQA, UTOP, VERT.
- تم تصحيح جدول أعلى 25 في هذا التقرير ليطابق التصنيف الفعلي (CPCI=Healthcare، MHOT=Travel & Leisure، MAAL=Real Estate، EFID=Food).

### توزيع الـ 61 Critical

- **43 MISSING_CRITICAL_METRIC**: 21 إيراد بلا بيانات، 11 صافي ربح بلا بيانات، 9 إيراد محجور، 2 صافي ربح محجور. معظمها شركات مالية/قابضة صغيرة أو تغطية ناقصة.
- **7 PBT_TAX_NET_PROFIT**: AMER Q2 2026، BINV Q2 2026، EGTS FY2024، GIHD FY2024، HRHO Q2 2026، MMAT FY2025، OFH FY2024. (تم إغلاق AMER FY2021 باستخدام NCI الضمني 95.9M بدلاً من رصيد NCI 102.3M.) في HRHO Q2 2026 الفجوة 600.8M تبدو NCI للفترة، لكن رصيد NCI 10.1B حالته `NEEDS_REVIEW`، لذلك يبقى التدقيق حذراً ولا يمرره تلقائياً.
- **5 GROSS_PROFIT_IDENTITY**: FWRY FY2019، IRON FY2011/FY2018، MPCO FY2022، NCEM FY2014 (تاريخية).
- **3 CASH_FLOW_SUM**: ARAB FY2023، MAAL FY2023، MFPC FY2023 (بيانات ناقصة/متناقضة).
- **2 BALANCE_SHEET_EQUATION**: IRON FY2013، NAHO FY2023 (تاريخية).
- **1 CASH_OPENING_CLOSING**: MAAL FY2022 (تاريخية).

**لا توجد مشكلة CRITICAL في قيمة ROE نفسها لأي من أعلى 25.** توجد مشكلتان في شركتين داخل القائمة لكنهما لا تؤثران على قيمة ROE: **ADRI** (إيراد بلا بيانات) و**MAAL** (تدفق نقدي/افتتاحي).

---

## 7. ما تبقى / Remaining work

1. **مصدر ثانٍ للحالات الغامضة** أعلاه (Mubasher/Thndr/القوائم الرسمية) قبل أي تعديل. لا نصحح من AskBorsa وحدها.
2. **تنظيف الأرباع المكررة** في MCQE, MPRC, ATLC, ASPI, DSCW, HELI: TTM محمي الآن، لكن القيم الربعية الخام ما زالت موجودة ويجب حجرها/إعادة استخراجها.
3. **تغطية 43 MISSING_CRITICAL_METRIC** من القوائم الأصلية، لا من الصفر. بعضها (شركات مالية) قد يكون REVENUE غير منطبق ويحتاج تصنيفاً «غير قابل للتطبيق» بدلاً من «مفقود».
4. **معالجة 18 مشكلة محاسبية** المتبقية (7 PBT + 5 مجمل + 3 تدفق + 2 ميزانية + 1 افتتاحي)؛ التاريخية منها يمكن توثيقها بدلاً من إجبارها على التعادل.
5. **تم ضبط periodEnd** لـ ADCI وABUK (سنوات مالية مختلفة) في دفعة فترات المالية 2026-10-29، ثم أعيد حساب النتائج؛ تبقى **ADRI Q3 2025** موثقة كفترة محتملة.
6. **التحقق من EFIC parent equity/NCI** من الميزانية.
7. إعادة تشغيل `scripts/audit-askborsa-annual.mjs` بعد كل دفعة تصحيحات، والتأكد من عدم ظهور `SCALE_X1000` أو `ANNUAL_COPY` جديدة.

---

## 7.1 تحديث 2026-10-29 / 2026-10-29 update

- تم إصلاح 851 فترة مالية، وعاد التدقيق بعد إعادة الحساب بدون نتائج مستقبلية.
- عُزلت 5 تقارير مستقبلية و25 قيمة مرتبطة بها.
- تم رفع `Financial Services` / `Investment` من الحالة أن `REVENUE` حقل critical.

---

## 8. أوامر التحقق / Verification commands

```bash
node scripts/run-recompute.cjs
npx tsx scripts/run-audit.ts
node scripts/audit-askborsa-annual.mjs
node scripts/verify-top-roe2.mjs
```

**ملفات مهمة / Key files:**

- `src/lib/financial/recompute.ts` — TTM guard + `niParentOf`
- `src/lib/financial/latest-period.ts` — latest-period selection
- `src/app/api/v1/rankings/route.ts` — latest/annual/TTM rankings
- `src/app/api/v1/companies/[id]/peers/route.ts` — peer selection
- `src/lib/audit/accounting-checks.ts` — PBT/NCI/BS checks
- `reports/askborsa-annual-comparison.csv` — latest external comparison
- `reports/data-accuracy-verification.md` — this report

---

## 9. حصاد AskBorsa الشامل — تحديث 2026-10-30 / Comprehensive AskBorsa harvest — 2026-10-30 update

### 9.1 نطاق الحصاد / Harvest scope

- تم جلب **288 شركة نشطة** من صفحات AskBorsa العامة: **253 `ok`**، **10 `no_pivots`**، **25 `fetch_failed`**.
- الصفحات تحتوي JSON مضمّناً (`pivots`) للفترة السنوية + Q1–Q4 لخمس سنوات، لكنه يغطي **10 بنود فقط** ولا يحتوي إيراداً أو تكلفة مبيعات.
- الأرباع في AskBorsa كثيراً ما تكون تراكمية أو غير متوافقة؛ لذلك لم تُستخدم قيمة ربعية إلا بعد اجتياز بوابة **مجموع الأرباع = السنة المالية** (هامش 5% أو 1 مليون جنيه).
- لم يُستخدم أي مصدر يتطلب تجاوز تسجيل دخول أو جدار دفع.

### 9.2 ما أُضيف / What was added

| العملية / Operation | العدد / Count | التحقق / Verification |
|---|---:|---|
| تعبئة سنوية للخانات الناقصة فقط / Annual only-missing fills | **463** قيمة | تقارير سنوية موثوقة، non-future، consolidated فقط، مع rollback |
| إضافة قيم ربعية من سلاسل تدفق مُتحقق منها / Verified discrete flow quarters | **400** قيمة | كل سلسلة تجتاز مجموع Q1–Q4 = FY |
| إضافة لقطات ميزانية ربعية Q1–Q3 / Point-in-time stock snapshots | **2,455** قيمة | ضمن 10× من السنة المالية، وتختلف عن قيمة FY |
| إضافة ميزانية Q4 من التقرير السنوي للتطبيق / Q4 balance sheet from app annual | **3,219** قيمة | **DERIVED**، ليست من AskBorsa؛ أُعيد وسم مصدرها |
| استبدال أرباع كانت نسخاً سنوياً / Annual-copy replacements | **20** قيمة | قيمة AskBorsa المنفصلة + بوابة المجموع |
| عزل أرباع نسخ سنوي مثبتة / Proven annual-copy quarantines | **212** قيمة | تقارير فيها ≥2 قيم تساوي FY؛ 861 قيمة كانت معزولة سابقاً |
| عزل قيم مستوردة فشلت الهوية / Imported values failing identity | **43** قيمة | 27 ميزانية (مطلوبات+حقوق > أصول)، 16 تدفق نقدي بأربعة أطراف جديدة |
| حالات مراجعة بلا حجر / Review-only cases | **284** | 248 تدفق نقدي، 36 فجوة ميزانية موجبة غير مفسرة بـNCI |

**ملاحظات مهمة / Important notes:**

- لم تُستخدم قيم صفرية كبديل عن مفقود؛ الخانات الصفرية والـUSD وBQDC/IRON استُبعدت.
- **305** ربعاً بقيمة واحدة تساوي FY تُركت للمراجعة فقط (لا دليل كافٍ للعزل)، و**861** قيمة كانت معزولة مسبقاً.
- القيم المستوردة تحمل `extractionMethod` صريحاً: `ASKBORA_HARVEST` أو `ASKBORA_QUARTERLY` أو `DERIVED` (لميزانية Q4).
- كل عملية لها ملف rollback، ولم يُحذف أي تقرير أو شركة.

### 9.3 مصالحة المرادفات / Alias reconciliation

- عُزلت **14 شركة مرادفة** reversibly (13 بلا تقارير + MOPCO التي تطابق MFPC): CNFG, CPC, DOMTY, EDBE, IBPH, MNHD, OPHC, PHAE, RMDT, SBAG, EZDK, EIPC, QNBA, MOPCO.
- **ECSC** ما زالت نشطة لأن بياناتها تتعارض مع EGCH (H1 2026: 1.794B مقابل Q1+Q2 = 1.190B)؛ لم يُحسم أي الطرفين صحيح، لذلك لم تُحذف أو تُدمج.
- **10 شركات** ما زالت نشطة بلا تقارير: DCCC, EFOOD, KORA, MESF, MISR, PSFL, RPCO, SUCE, VLMR, VODE. بعضها له بيانات AskBorsa سنوية، لكن نهاية السنة المالية غير مؤكدة، فلم تُنشأ تقارير بها.
- **ECSC/MOPCO** وغيرها من الحالات غير المحسومة موثقة للمراجعة، لا تُعامل كصفر.

### 9.4 الوضع الحالي / Current state (2026-10-30)

| المؤشر / Metric | القيمة |
|---|---:|
| الشركات النشطة / Active companies | **274** (إجمالي 289) |
| التقارير الموثوقة / Trusted reports | **6,620** |
| الشركات ذات تقرير سنوي / Companies with annual report | **259** |
| القيم المعتمدة / Authoritative values | **79,330** |
| إجمالي القيم / Total values | **98,182** |
| القيم المعزولة / Quarantined values | **18,852** |
| تغطية ISIN / ISIN coverage | **88.3%** |
| الأسهم القائمة / Shares outstanding | **85.8%** |
| شركات لها سعر / Companies with price | **241** (33 بلا سعر) |
| أسعار أقدم من 7 أيام / Prices older than 7 days | **241** (أحدث سعر 2026-09-30) |
| فجوات / Gaps | no-trusted 11، no-annual 15، missing-core 19، missing-ISIN 32 |
| نتائج التدقيق / Audit issues | **2,045**: 82 critical / 306 high / 718 medium / 939 low |

**مقارنة بخط الأساس 2026-10-29:** زادت القيم المعتمدة من **68,659** إلى **79,330** (+10,671)، والتقارير الموثوقة من **6,501** إلى **6,620**، لكن التدقيق ارتفع من **56** إلى **82** critical. السبب الرئيسي ليس تدهور القيم، بل **10 شركات نشطة بلا بيانات** (تساهم بنحو 20 critical) وتشديد الحجر على النسخ السنوي. بعد استبعاد الشركات العشر بلا بيانات، يبقى نحو **62 critical**، قريباً من خط الأساس.

### 9.5 التحقق / Verification

| الفحص / Check | النتيجة |
|---|---|
| `npx tsc --noEmit` | **نظيف** |
| `npm test` | **48/48 ناجح** (7 ملفات) |
| ESLint على سكربتات الحصاد | **نظيف** |
| إعادة الحساب | 274 شركة / 265,113 مقياساً / 4,197 حدثاً / 9,818 فترة |
| التدقيق | `cmvuar2d60000bxbgnadzyn8a` — 2,045 إجمالاً |
| API الشركات | `EAST` يعرض FY2025 net profit 9.711B، revenue 37.382B، assets 43.596B |
| API أحدث النتائج | BONY Q3 2026، CIRA FY 2026، بلا تواريخ 2026-12-31 |
| مقارنة AskBorsa بعد الحصاد | **588 MATCH / 52 MISMATCH / 9 KNOWN_SOURCE_ERROR / 18 CLOSE / 7 PARENT_MATCH / 26 CURRENCY_MISMATCH / 41 APP_MISSING**؛ 263 جُلبت / 11 فشلت / 36 اسم غير مطابق |
| بناء إنتاجي / E2E | **لم يُشغّل في هذه الدفعة** — لا يُدّعى نجاحه |

### 9.6 ما تبقى بعد الحصاد / Remaining after harvest

1. حسم **ECSC مقابل EGCH** بمصدر ثانٍ (ISIN/قوائم رسمية) قبل أي دمج.
2. توفير تقارير للشركات العشر بلا بيانات أو تعليق ظهورها كـprovisional؛ لا تُملأ بتخمين.
3. مراجعة **52 mismatch / 26 currency mismatch / 41 app-missing** من AskBorsa بمصدر ثانٍ.
4. معالجة **82 critical**: 18 محاسبية + فجوات تغطية، مع فصل التاريخية عن القابلة للإصلاح.
5. استكمال **32 ISIN** و**15 شركة بلا قطاع Mubasher**.
6. تحديث الأسعار من مصدر مصرح؛ كل الأسعار الحالية إغلاقات 2026-09-30 وليست live.
7. تنظيف الحالات الـ284 review-only (تدفق نقدي/ميزانية) بعد الحصول على قوائم أصلية.
8. إضافة اختبارات وحدة لبوابة مجموع الأرباع وحارس المقياس (المنطق التشغيلي مُختبر بالتشغيل والـrollback، لكن لا توجد تغطية unit بعد).

**ملفات التراجع / Rollback files:**

- `reports/askborsa-missing-rollback.json` — 463 تعبئة سنوية.
- `reports/askborsa-quarterly-rollback.json` — 6,074 إضافة + 20 تصحيحاً.
- `reports/annual-copy-quarantine.json` — 212 عزل نسخ سنوي.
- `reports/askborsa-fill-validation.json` — 43 عزل فشل هوية.
- `reports/company-alias-quarantine.json` — 14 شركة مرادفة.
- `reports/askborsa-harvest.json` — لقطة الحصاد الخام.
- `reports/data-completeness-baseline.json` / `.md` — تغطية الحقول الحالية.

---

## 10. تحديث التحقق النهائي — 2026-11-03 / Final accuracy verification

### 10.1 عزل تقرير SIPC المخلوط / SIPC mixed-report quarantine

**المشكلة:** تقرير SIPC السنوي FY2025 (AskBorsa summary) خلط بين شركتين: إجمالي الأصول/الحقوق الصحيح لـ SIPC (169M / 106M) مع قائمة دخل وتدفق نقدي وأصول تفصيلية لشركة أخرى (إيرادات 9.09B، أصول متداولة 6.6B، `NET_PROFIT_PARENT` 2.28B). النتيجة: ROE = **2,155%** بدلاً من القيمة الصحيحة.

**الدليل:** فشل `ASSET_COMPONENTS` (أصول متداولة + غير متداولة = 8.29B مقابل إجمالي 169M)، وتجاوز مكوّنات لإجماليها، واختلاف `NET_PROFIT` (−6.65M) عن `NET_PROFIT_PARENT` (2.28B).

**الإجراء:** عزل **24** قيمة ملوّثة reversibly (`NEEDS_REVIEW`)، والإبقاء على الإجماليات و`NET_PROFIT`. أُعيد الحساب، فأصبح ROE = **−6.27%** وROA = **−3.93%**، وخرج SIPC من قائمة أعلى ROE.

**التراجع:** `reports/quarantine-mixed-SIPC-2025-rollback.json` (كل قيمة، حالتها وملاحظاتها السابقة). السكربت: `scripts/quarantine-mixed-company-report.mjs`.

### 10.2 إصلاح سعر `undervalued` / Freshest-price fix

كان `buildMaps` يبني `new Map` من قائمة أسعار مرتبة تصاعدياً، فتغلّب أقدم سعر على الأحدث. أُصلح ليبقي أحدث لقطة لكل شركة عبر `latestPriceByCompany`. النتيجة: GDWA 0.649، EMFD 13.56، ELWA 1.49 بتاريخ 2026-09-30. اختبارات: `src/lib/financial/__tests__/latest-price.test.ts` (4).

### 10.3 حارس التقييم المتطرف / Extreme-valuation guard

`evaluateUndervaluation` يرفض الآن fair value >10× أو <0.1× السعر (`fairValue=null`, `upside=null`, `reviewRequired=true`, `reviewReason=EXTREME_VALUATION_GAP`)، ويبقي upside ≥200% مع وسم مراجعة. DEIN أصبح fair value = null؛ GDWA/EMFD/ELWA موسومة للمراجعة. اختبارات: `src/lib/analytics/__tests__/undervaluation.test.ts` (5).

### 10.4 الفترات المستقبلية / Future periods

`/api/v1/dashboard/latest-results` يعيد 12 نتيجة، **0** منها بتاريخ مستقبلي؛ كل صف يحمل `asOf` صريحاً. `isFuturePeriodEnd` يسمح بفارق يوم واحد فقط.

### 10.5 حل المعرّفات / Identifier resolution

`/api/v1/companies/[id]` و`/financials` يحلّان ticker أو ISIN أو cuid. `/company/COMI` و`/api/v1/companies/COMI` و`/api/v1/companies/COMI/financials` كلها 200.

### 10.6 الحالة بعد الإصلاح / State after the fixes

| Metric | Value |
|---|---:|
| `VALID` values | 80,959 |
| `NEEDS_REVIEW` values | 18,964 |
| Trusted reports | 6,814 |
| Companies with annual data | 270 / 282 |
| Latest audit | 2,116 (86 critical / 324 high / 727 medium / 979 low) |
| Future-dated results | 0 |
| Dividends | 0 |

### 10.7 المتبقي / Remaining

- 86 critical تحتاج تحقيقاً فردياً (معظمها missing critical metrics وcash-flow identity).
- 284 فجوة هوية review-only (248 تدفق، 36 ميزانية) تحتاج مصدراً ثانياً.
- 305 نسخة سنوية بقيمة واحدة review-only.
- 12 mismatch غامض مع AskBorsa (EFIC, HELI, DAPH, ASPI, ATLC, MPRC, TAQA, HRHO, OFH, TMGH, DSCW, MCRO).
- ECSC/EGCH غير محسومتين (H1 2026: 1.794B مقابل 1.190B) بلا مصدر ثانٍ.
- 8 شركات بلا بيانات (ECCW, KORA, EFOOD, MESF, PSFL, RPCO, VODE, VLMR).

---

## 11. تحديث ما بعد المعالجة النهائية — 2026-11-03 / Post-remediation verification

### 11.1 نتيجة التدقيق النهائية / Final audit result

**Run ID:** `cmw0ynprx0000bxs4jc3tp4im`  
**النطاق / Scope:** 276 شركة نشطة.

| المقياس / Metric | القيمة / Value |
|---|---:|
| إجمالي الملاحظات / Total findings | 1,974 |
| خطير / Critical (severity) | 42 |
| مرتفع / High | 292 |
| متوسط / Medium | 691 |
| منخفض / Low | 949 |
| **blocker class** | **0** |
| coverage class | 637 |
| advisory class | 1,318 |
| metadata class | 19 |

**التفسير المهم:** الـ42 ملاحظة «خطيرة» كلها من فئة `coverage` وليست `blocker`. لا توجد أي ملاحظة `blocker` خطيرة أو مرتفعة. الـ42 هي:

- 27 شركة بلا `REVENUE` مسجّل.
- 8 شركات `REVENUE` لديها معزول بالكامل.
- 6 شركات بلا `NET_PROFIT` مسجّل.
- 1 شركة `NET_PROFIT` لديها معزول بالكامل.

هذه فجوات تغطية، وليست تناقضات محاسبية. تظهر على `/data-quality` بوسم `coverage` ولا تُخفى.

### 11.2 المعالجات المنفذة / Remediation applied

| السكربت / Script | الإجراء / Action | ملف التراجع / Rollback |
|---|---|---|
| `scripts/quarantine-balance-sheet-failures.mjs` | عزل 10 قيم في 8 حالات فشل ميزانية | `reports/balance-sheet-failures-rollback.json` |
| `scripts/fix-pbt-tax-failures.mjs` | تصحيح إشارة الضريبة في EGTS FY2024 وMMAT FY2025؛ عزل 10 بنود PBT/ضريبة غير قابلة للتوفيق | `reports/pbt-tax-failures-rollback.json` |
| `scripts/fix-critical-identities.mjs` | تكبير EGAS 1e6×، تصحيح إشارة NCEM، عزل 14 بنداً شاذاً | `reports/critical-identities-rollback.json` |
| `scripts/quarantine-high-blockers.mjs` | عزل ASCM liabilities، كتلة UEGC FY2021، كتلة VALU Q4 2024، ونسخة AXPH المكررة | `reports/high-blockers-rollback.json` |
| `scripts/quarantine-cashflow-outliers.mjs` | عزل 83 قيمة في 34 حالة تناقض تدفق نقدي (العملية/الاستثمارية/التمويلية + FX + صافي التغير) | `reports/cashflow-outliers-rollback.json` |

**قاعدة قرار التدفق النقدي:** تُقارن البنود الثلاثة (+FX) بحركة النقد الافتتاحي/الختامي. إذا طابقت البنود الحركة، يُعزل صافي التغير؛ إذا طابق صافي التغير الحركة، تُعزل البنود؛ إذا لم يطابق أي منهما، تُعزل الكتلة كاملة مع الإبقاء على رصيد النقد. لا حذف، وكل قيمة قابلة للاستعادة.

### 11.3 تشديد تصنيف التدقيق / Audit-classification hardening

- `ASSET_COMPONENTS`: فجوة المكوّنات أصبحت `coverage`/`high` بدلاً من `blocker`/`critical`، لأن الإجمالي قد يكون صحيحاً مع مكوّنات ناقصة.
- `DEBT_COMPONENTS`: تجاوز المكوّنات لإجمالي الدين أصبح `coverage`/`high`، لأنه غالباً اختلاف تعريف (صافي مقابل إجمالي).
- `CASH_FLOW_SUM`: إذا كان صافي التغير مطابقاً لحركة النقد، فالفجوة `coverage`/`high`؛ أما إذا **تعارض** صافي التغير مع حركة النقد، فيبقى `blocker`.
- اختبار انحدار جديد يغطي الحالتين: `src/lib/audit/__tests__/audit-engine.test.ts`.

### 11.4 الحالة النهائية / Final state

| Metric | Value |
|---|---:|
| Companies (total / active) | 297 / 276 |
| Trusted reports | 6,803 |
| Companies with annual data | 271 / 276 |
| `VALID` values | 80,215 |
| `NEEDS_REVIEW` values | 19,015 |
| Calculated metrics | 270,783 |
| Financial events | 4,235 |
| Dividends | 0 |
| Blockers (critical/high) | **0 / 0** |
| Coverage-class criticals | 42 |
| Future-dated results | 0 |

### 11.5 المتبقي / Remaining

- 42 فجوة تغطية حرجة (REVENUE/NET_PROFIT) تحتاج استخراجاً من القوائم الرسمية أو مصدر ثانٍ.
- 19,015 قيمة معزولة، معظمها نسخ سنوية مكررة وتقارير مختلطة وتدفقات نقدية غير متسقة.
- 284 فجوة هوية review-only (248 تدفق، 36 ميزانية).
- 305 نسخة سنوية بقيمة واحدة review-only.
- ECSC/EGCH غير محسومتين (H1 2026: 1.794B مقابل 1.190B) بلا مصدر ثانٍ.
- KORA نشطة بلا قوائم مالية؛ 6 شركات أخرى عُطّلت reversibly (ECCW, EFOOD, MESF, PSFL, RPCO, VODE).
- لا مصدر أسعار لحظي مرخّص؛ لقطة TradingView متأخرة 15 دقيقة.
- لا سجلات توزيعات أرباح، ولا نسخ احتياطي/مراقبة/دفع إلكتروني.
