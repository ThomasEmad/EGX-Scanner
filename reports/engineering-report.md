# تقرير الهندسة — EGX Scanner / Engineering Report

**التاريخ / Date:** 2026-10-30  
**آخر تدقيق / Latest audit run:** `cmvuar2d60000bxbgnadzyn8a`  
**هذا تقرير فني وبيانات — ليس توصية استثمارية. / This is an engineering and data report, not investment advice.**

---

## A. الملخص التنفيذي / Executive summary

المشروع يعمل، وTypeScript نظيف، واختبارات الوحدة ناجحة (48/48). في هذه الدفعة تم تنفيذ **حصاد AskBorsa شامل** لمعالجة الأرباع المكررة والصفوف الناقصة، مع الحفاظ على سياسة «لا صفر بدل مفقود» و«لا تعديل بلا دليل». أُضيفت **463** قيمة سنوية ناقصة، و**6,074** قيمة ربعية (منها 400 تدفق مُتحقق ببوابة مجموع الأرباع، و2,455 لقطة ميزانية، و3,219 ميزانية Q4 مشتقة من التقرير السنوي للتطبيق)، و**20** استبدالاً لأرباع كانت نسخاً سنوياً، مع **212+43** حالة عزل قابلة للتراجع. كما عُزلت **14 شركة مرادفة** reversibly.

**الوضع الحالي بعد الدفعة:**

- **2,045 مشكلة تدقيق**: 82 critical / 306 high / 718 medium / 939 low.
- **0 نتائج `FUTURE_PERIOD`** بعد إعادة التدقيق.
- **82 critical** تشمل نحو **20** من 10 شركات نشطة بلا بيانات؛ بعد استبعادها يبقى نحو **62**، قريباً من خط الأساس 56.
- **274 شركة نشطة**، **6,620 إفصاح موثوق غير محذوف**، **79,330 قيمة معتمدة**، **4,197 حدث**، **265,113 قياساً محسوباً**.
- **851 فترة مالية** صُححت من أدلة المصدر/التاريخ، و**5 تقارير مستقبلية** عُزلت مع **25 قيمة**.
- مقارنة AskBorsa بعد الحصاد: **588 MATCH / 52 MISMATCH / 9 KNOWN_SOURCE_ERROR / 18 CLOSE / 7 PARENT_MATCH / 26 CURRENCY_MISMATCH / 41 APP_MISSING** (263 جُلبت / 11 فشلت / 36 اسم غير مطابق).

---

## B. نظرة معمارية / Architecture overview

- **الواجهة:** Next.js App Router + TypeScript + Tailwind/shadcn، ثنائية اللغة AR/EN مع RTL.
- **الخادم:** Route Handlers تحت `src/app/api/v1/...`، وطبقة تحليل في `src/lib/`.
- **قاعدة البيانات:** Prisma + SQLite (`prisma/prisma/dev.db`).
- **خط البيانات:** استيراد من Yahoo/AskBorsa/Mubasher/S&P/Reuters → `FinancialReport` + `FinancialValue` → تحقق → `CalculatedMetric` → ماسحات/ترتيب/مقارنات.
- **محرك إعادة الحساب:** `src/lib/financial/recompute.ts` — يبني المقاييس المحسوبة والأحداث.
- **محرك التدقيق:** `src/lib/audit/*` — فئات: blocker / coverage / advisory / metadata.
- **سياسة النزاهة:** `src/lib/financial/integrity-policy.ts` — القيمة `VALID` فقط، مع استبعاد النسخ المرحّلة والصور الصفرية على المقاييس التي لا يصح أن تكون صفراً.
- **اختيار آخر فترة:** `src/lib/financial/latest-period.ts` — يمنع خلط السنوي/الربعي ويوفر أساس `latest|ttm|annual`.
- **واجهات العميل:** `src/components/egx/*` و`src/app/*`؛ بعض المسارات تُدار كعرض SPA داخل `/dashboard`.

**تدفق القرار الحرج:** مصدر → تقرير → قيمة خام → تحقق/عزل → حساب → تدقيق → عرض مع فترة ومصدر وحالة ثقة.

---

## C. النتائج المؤكدة / Verified findings

| # | الشدة | المشكلة | الدليل/الموقع | الأثر | الحالة |
|---|---|---|---|---|---|
| 1 | P0 | فترات مستقبلية تظهر كنتائج معلنة | `src/lib/audit/temporal-checks.ts` كان يسمح بـ +100 يوم؛ `src/app/api/v1/dashboard/latest-results/route.ts` كان يقرأ `NET_PROFIT` دون `subPeriod`/`periodEnd`/`deletedAt` | عرض FY 2026 قبل نهايتها، وتلويث “أحدث النتائج” | **مُصلح** |
| 2 | P1 | تقويمات مالية خاطئة | 158 تقريراً سنوياً في `reports/fiscal-calendar-diagnosis.json`؛ أمثلة NIPH/GSSC/MICH (يونيو)، CIRA (أغسطس)، GRCA/ELNA (مارس)، VALU (أبريل) | فترات خاطئة، احتساب TTM/الاستحقاق الخاطئ، ظهور “مستقبلي” وهمي | **مُصلح لـ851 فترة** |
| 3 | P1 | إحصاءات لوحة القيادة تشمل محذوفاً/غير موثوق | `src/app/api/v1/dashboard/route.ts` كان `count()` بلا شروط | أرقام “إفصاح/قيمة موثقة” مضخمة | **مُصلح** |
| 4 | P1 | فلتر قائمة المراقبة يفلتر الصفحة الحالية فقط | `src/components/egx/companies-view.tsx` كان `filter()` على `data.companies` | شركات مراقبة مفقودة وإجمالي كاذب | **مُصلح** |
| 5 | P1 | خلط أساس القوائم في قائمة المراقبة | `src/app/api/v1/watchlist/route.ts` كان SQL خاماً + N+1 لأسعار كل شركة | احتمال خلط consolidated/standalone وبطء | **مُصلح** |
| 6 | P2 | `useMemo` للـ debounce | `companies-view.tsx` | سلوك جانبي داخل render وتحديثات غير متوقعة | **مُصلح** |
| 7 | P2 | غياب وضوح الفترة على البطاقات | `companies-view.tsx` كان يعرض فترة الإيراد فقط؛ `watchlist/page.tsx` بلا عمود فترة | المستخدم يظن أن كل المؤشرات من نفس السنة | **مُصلح** |
| 8 | P2 | `REVENUE` كحقل critical للشركات المالية | `src/lib/audit/missing-data-checks.ts` | 5 criticals زائفة لشركات لا تملك بند إيراد تقليدي | **مُصلح** |
| 9 | P2 | ادعاءات تسويقية غير دقيقة | `src/app/landing-client.tsx`: “100% audited” و“Official” | مبالغة في الثقة/الإيحاء الرسمي | **مُصلح** |
| 10 | P1 | 82 critical متبقية | نحو 20 من 10 شركات بلا بيانات + فجوات تغطية + محاسبية | تغطية/تحقق ناقص | **مفتوح** |
| 11 | P1 | 52 mismatch خارجي غير محسوم | `reports/askborsa-annual-comparison.csv` | لا يجوز التصحيح من مصدر واحد | **مفتوح** |
| 12 | P2 | 18,852 قيمة `NEEDS_REVIEW` | قاعدة البيانات | مستبعدة من التحليلات | **مفتوح** |
| 13 | P2 | 32 ISIN مفقود، 15 شركة بلا قطاع Mubasher | تقارير القطاعات/التغطية | تصنيف/ربط ناقص | **مفتوح** |
| 14 | P2 | أرباع منسوخة من السنوي | 20 استبدالاً متحققاً + 212 عزل + 305 للمراجعة | TTM محمي، وبعض الصفوف تحتاج مصدراً ثانياً | **مُحسّن** |
| 15 | P2 | Premium endpoints غير مختبرة مجهولة | `company events → 403`, `ai-analysis → 401` | لا يمكن تأكيد سلامة الاستجابة | **محجوب** |

### أمثلة مثبتة

- **NIPH / GSSC / MICH / MFSC** تنتهي سنتها في 30 يونيو؛ كان `periodEnd` مسجلاً 31 ديسمبر.
- **CIRA** تنتهي في 31 أغسطس؛ **GRCA/ELNA** في 31 مارس؛ **VALU** في 30 أبريل.
- **MASR/AIDC/CPME** تبدأ سنتها في يناير، لذا FY 2026 المنتهية 31 ديسمبر 2026 ليست نتيجة معلنة في أكتوبر 2026؛ عُزلت.
- **ECCW** كان لديها تقريران مستقبليان؛ عُزلا بدلاً من تخمين تاريخ بديل.
- **AALR FY2024** صافي الربح 56,350 صحيح (AskBorsa يطبعه بالآلاف)، وليس خطأ مقياس.
- **TMGH FY2024**: كان OCF في Q2/Q3 نسخة من 44.04B؛ استُبدل بـ19.699B و−3.320B بعد بوابة مجموع الأرباع.
- **HELI FY2022**: صافي ربح Q3 كان 603.24M (نسخة سنوية) واستُبدل بـ3.17M؛ وأصول Q3 بـ4.099B بدلاً من 4.854B.
- **Q4 balance sheet**: 3,219 قيمة Q4 ناقصة نُسخت من التقرير السنوي للتطبيق ووُسمت `DERIVED`، لا AskBorsa.
- **Aliases**: عُزلت 14 شركة مرادفة reversibly؛ MOPCO كانت مطابقة تماماً لـMFPC في Q1 2026 (5.2796B ربح / 8.1797B إيراد).

---

## D. خارطة الطريق المرتبة / Prioritized roadmap

1. **P0 — إيقاف عرض المستقبل** (مكتمل): helper موحد + فلاتر read paths + عزل reversible.
2. **P1 — تصحيح التقويمات** (مكتمل لـ851 فترة): إصلاح `periodStart`/`periodEnd` من ملاحظات المصدر/التاريخ، مع rollback.
3. **P1 — توحيد حدود الثقة** (مكتمل): `VALID` + `CURRENT` + non-deleted + trusted + non-future في dashboard/latest/company detail.
4. **P1 — تصحيح قائمة المراقبة** (مكتمل): `ids` على الخادم + `fetchCalcMany` + استعلام أسعار واحد.
5. **P1 — معالجة 18 محاسبية** (التالي): PBT/NCI، gross profit، cash-flow sum، balance sheet، cash opening.
6. **P1 — حسم 52 mismatch** (التالي): مصدر ثانٍ (Mubasher/Thndr/القوائم) قبل أي تعديل.
7. **P2 — تنظيف الأرباع المنسوخة** وحالات `NEEDS_REVIEW`.
8. **P2 — استكمال ISIN/القطاعات** وتقليل 15 شركة غير مصنفة.
9. **P2 — تغطية missing metrics** من القوائم الأصلية، مع تمييز “not applicable” عن “missing”.
10. **P3 — تحسينات UX/أداء/اختبارات إضافية** بعد استقرار الدقة.

---

## E. التحسينات المنفذة / Implemented improvements

### الكود

- `src/lib/financial/period-validity.ts` — `isFuturePeriodEnd` و`latestAnnouncedPeriodEnd` (هامش يوم واحد).
- `src/lib/audit/temporal-checks.ts` — استبدال هامش 100 يوم بالدالة الموحدة.
- `src/lib/audit/__tests__/temporal-checks.test.ts` — اختبار فترة +60 يوماً وفترة اليوم.
- `src/lib/financial/__tests__/period-validity.test.ts` — 4 اختبارات حدودية.
- `src/app/api/v1/dashboard/latest-results/route.ts` — إعادة كتابة: `VALID` + `CURRENT` + trusted/non-deleted + non-future + `isAuthoritativeValue` + تفضيل consolidated + dedupe.
- `src/app/api/v1/dashboard/route.ts` — إحصاءات من تقارير موثوقة غير محذوفة، وقيم غير مستقبلية.
- `src/app/api/v1/companies/route.ts` — فلتر `ids` للخادم، ومقارنة snapshot بـ`fiscalYear` بدلاً من label.
- `src/app/api/v1/companies/[id]/route.ts` — `dataAsOf` لا يختار تقريراً مستقبلياً.
- `src/app/api/v1/watchlist/route.ts` — إعادة كتابة: `fetchCalcMany` (بيان واحد لكل شركة) + استعلام أسعار واحد + `periodLabel/fiscalYear`.
- `src/components/egx/companies-view.tsx` — `useEffect` للـdebounce، فلتر مراقبة على الخادم، فترة أسفل كل مؤشر، pagination للمراقبة.
- `src/app/watchlist/page.tsx` — عمود “الفترة”، وتلوين محايد عند غياب التغير.
- `src/lib/client/api.ts` — `ids` + حقول snapshot.
- `src/lib/audit/missing-data-checks.ts` — Financial Services/Investment: لا `REVENUE` critical؛ اتجاه مالي يستخدم `NET_PROFIT`.
- `src/app/landing-client.tsx` — “Traceable” بدلاً من “100% audited”، و“Independent” بدلاً من “Official”، ووصف صريح لحالة المراجعة.
- `README.md` — تحديث أرقام الواقع (264 شركة/6,501 إفصاح/68,659 قيمة) وإزالة وصف قديم.

### البيانات (reversible)

- `scripts/dq-fix-fiscal-periods.mjs` — dry-run/apply/rollback؛ 851 تصحيحاً.
- `scripts/quarantine-future-periods.mjs` — عزل 5 تقارير و25 قيمة.
- `scripts/harvest-askborsa.mjs` — حصاد 288 شركة (253 ok).
- `scripts/recover-askborsa-missing.mjs` — 463 تعبئة سنوية only-missing.
- `scripts/recover-quarterly-askborsa.mjs` — 6,074 إضافة + 20 استبدال نسخ سنوي.
- `scripts/quarantine-annual-copies.mjs` — 212 عزل نسخ سنوي.
- `scripts/validate-askborsa-fills.mjs` — 43 عزل فشل هوية + 284 مراجعة.
- `scripts/quarantine-company-aliases.mjs` — 14 شركة مرادفة.
- `scripts/fix-q4-derived-provenance.mjs` — 3,219 قيمة Q4 موسومة DERIVED.
- Rollback files:
  - `reports/fiscal-period-corrections.json`
  - `reports/future-period-quarantine.json`
  - `reports/askborsa-missing-rollback.json`
  - `reports/askborsa-quarterly-rollback.json`
  - `reports/annual-copy-quarantine.json`
  - `reports/askborsa-fill-validation.json`
  - `reports/company-alias-quarantine.json`

---

## F. نتائج التحقق / Verification results

| الفحص / Check | الأمر / Command | النتيجة |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **نظيف** |
| Unit tests | `npm test` | **48/48 ناجح** (7 ملفات) |
| ESLint (سكربتات الحصاد) | `npx eslint scripts/...` | **نظيف** |
| Recompute | `node scripts/run-recompute.cjs` | 274 شركة / 265,113 مقياساً / 4,197 حدثاً / 9,818 فترة / 72.4s |
| Audit | `npx tsx scripts/run-audit.ts` | 2,045 إجمالاً؛ 82/306/718/939 |
| Future audit | استعلام `FUTURE_PERIOD` | **0** |
| AskBorsa harvest | `node scripts/harvest-askborsa.mjs` | 288 شركة: 253 ok / 10 no_pivots / 25 fetch_failed |
| Annual fill | `node scripts/recover-askborsa-missing.mjs --apply` | 463 قيمة ناقصة فقط |
| Quarterly recovery | `node scripts/recover-quarterly-askborsa.mjs --apply` | 6,074 إضافة + 20 استبدال نسخ سنوي |
| Identity validation | `node scripts/validate-askborsa-fills.mjs --apply` | 43 عزل فشل هوية؛ 284 للمراجعة |
| AskBorsa comparison | `node scripts/audit-askborsa-annual.mjs` | 588 MATCH / 52 MISMATCH / 9 KNOWN / 18 CLOSE / 7 PARENT_MATCH / 26 CURRENCY / 41 APP_MISSING |
| Dashboard API | `GET /api/v1/dashboard/latest-results` | BONY Q3 2026، CIRA FY 2026، بلا 2026-12-31 |
| Companies API | `GET /api/v1/companies?search=EAST` | EAST FY2025: 9.711B ربح / 37.382B إيراد / 43.596B أصول |
| Production build / E2E | — | **لم يُشغّل في هذه الدفعة** |

> ملاحظة: تحذيرا ESLint في `src/app/watchlist/page.tsx` موجودان مسبقاً (`window.location.href`) ولم يُغيّرا في هذه الدفعة.

---

## G. المخاطر والقيود المتبقية / Remaining risks and limitations

- **82 critical** لم تُحل؛ نحو 20 منها من 10 شركات نشطة بلا بيانات. الباقي فجوات تغطية ومحاسبية تحتاج قوائم أصلية.
- **ECSC مقابل EGCH** تعارض غير محسوم (H1 2026: 1.794B مقابل 1.190B)؛ لم يُدمج أو يُحذف أي طرف.
- **10 شركات نشطة بلا تقارير**: DCCC, EFOOD, KORA, MESF, MISR, PSFL, RPCO, SUCE, VLMR, VODE. بعضها له بيانات AskBorsa لكن نهاية السنة المالية غير مؤكدة.
- **52 mismatch / 26 currency mismatch / 41 app-missing** خارجية: لا تُصحح من AskBorsa وحدها؛ تحتاج مصدراً ثانياً.
- **18,852 NEEDS_REVIEW**: مستبعدة من التحليلات، لكنها ليست “غير موجودة”.
- **32 ISIN مفقود** و**15 شركة بلا قطاع Mubasher**: تصنيف/ربط ناقص.
- **الأسعار**: 241 شركة لها سعر، كلها أقدم من 7 أيام (أحدث 2026-09-30)؛ ليست live.
- **284 حالة review-only** (تدفق نقدي/ميزانية) و**305** ربعاً بقيمة واحدة تساوي FY لم تُعزل لعدم كفاية الدليل.
- **Premium endpoints** لم تُختبر مجهولة (403/401)؛ لا يمكن تأكيد سلامة الاستجابة.
- **البيانات الخارجية** قد تتغير؛ المقارنات لقطة زمنية وليست ضماناً دائماً.

---

## H. أولويات الهندسة القادمة / Next engineering priorities

1. **P1:** حسم ECSC/EGCH بمصدر ثانٍ (ISIN/قوائم رسمية) قبل أي دمج.
2. **P1:** توفير بيانات للشركات العشر بلا تقارير أو تعليق ظهورها كـprovisional؛ لا تُملأ بتخمين.
3. **P1:** حل المشكلات المحاسبية المتبقية (PBT/NCI، gross profit، cash-flow، balance sheet، cash opening) بأدلة المصدر.
4. **P1:** حسم 52 mismatch / 26 currency / 41 app-missing بعد مقارنة AskBorsa الجديدة.
5. **P2:** استكمال 32 ISIN و15 قطاعاً، وتحديث الأسعار من مصدر مصرح.
6. **P2:** مراجعة 284 حالة review-only بعد الحصول على قوائم أصلية.
7. **P2:** إضافة اختبارات وحدة لبوابة مجموع الأرباع وحارس المقياس، واختبارات تكامل لمسارات dashboard/latest-results/watchlist.
8. **P3:** تحسينات UX/أداء/إتاحة بعد استقرار الدقة.

---

## I. تحديث حصاد AskBorsa — 2026-10-30 / AskBorsa harvest update

### I.1 السكربتات المضافة / New reproducible scripts

| السكربت / Script | الوظيفة / Purpose | الحالة |
|---|---|---|
| `scripts/harvest-askborsa.mjs` | جلب صفحات AskBorsa العامة واستخراج `pivots` | 288 شركة، 253 ok |
| `scripts/recover-askborsa-missing.mjs` | تعبئة الخانات السنوية الناقصة فقط | 463 قيمة، rollback |
| `scripts/recover-quarterly-askborsa.mjs` | استبدال النسخ السنوي وإضافة الأرباع المتحققة | 6,074 إضافة + 20 استبدال |
| `scripts/quarantine-annual-copies.mjs` | عزل النسخ السنوي المثبت (≥2 قيم = FY) | 212 قيمة |
| `scripts/validate-askborsa-fills.mjs` | التحقق من هوية الميزانية والتدفق بعد الاستيراد | 43 عزل + 284 مراجعة |
| `scripts/quarantine-company-aliases.mjs` | عزل المرادفات reversibly | 14 شركة |
| `scripts/fix-q4-derived-provenance.mjs` | وسم ميزانية Q4 كمشتقة من التقرير السنوي | 3,219 قيمة |

### I.2 قواعد الأمان المطبقة / Safety rules applied

- **لا صفر بدل مفقود**: القيم الصفرية على المقاييس غير الصفرية لا تُستورد.
- **لا تجاوز مصادقة/جدار دفع**: الصفحات العامة فقط.
- **حارس مقياس**: 10× للميزانية، 100× للتدفق، مع استبعاد BQDC/IRON المعروفين.
- **بوابة مجموع الأرباع**: Q1+Q2+Q3+Q4 = FY ضمن 5% أو 1M جنيه.
- **لا استبدال إلا لنسخة سنوية مثبتة**: القيمة الحالية تساوي FY، والقيمة الجديدة متحققة.
- **الهوية المحاسبية**: المطلوبات+الحقوق > الأصول ⇒ عزل القيم المستوردة، لا تعديل الصف.
- **rollback لكل عملية**: لا حذف، ولا تعديل غير قابل للعكس.

### I.3 الأثر على التغطية / Coverage impact

- القيم المعتمدة: **68,659 → 79,330** (+10,671).
- التقارير الموثوقة: **6,501 → 6,620**.
- الشركات ذات تقرير سنوي: **258 → 259**.
- ISIN: **90.9% → 88.3%** بسبب دخول 10 شركات جديدة بلا ISIN (وليست خسارة في الشركات القديمة).
- التدقيق: **2,123 → 2,045** إجمالاً، لكن critical **56 → 82** بسبب الشركات العشر بلا بيانات وتشديد الحجر.

---

## الخلاصة / Conclusion

تم تحويل “أحدث النتائج” من عرض غير موثوق يمكن أن يعرض المستقبل إلى مسار محكوم بحدود ثقة صريحة، مع إصلاح تقويمات مالية واسعة وعزل reversible. أضاف حصاد AskBorsa **10,671 قيمة معتمدة** وعالج **20** ربعاً كان نسخة سنوية، مع عزل **255** قيمة إضافية (212 نسخ سنوي + 43 فشل هوية) و**14** شركة مرادفة. المنتج أصبح أكثر صدقاً وقابلية للتدقيق، لكنه ليس “مكتمل الدقة” بعد: 82 critical و52 mismatch و18,852 حالة مراجعة و10 شركات بلا بيانات تبقى مفتوحة وتحتاج تحقيقاً بمصادر.

---

## J. تحويل الإنتاج النهائي — 2026-11-03 / Final production transformation

### J.1 ما تغيّر في التطبيق / Application changes

| المحور / Area | التغيير / Change | التحقق / Verification |
|---|---|---|
| صفحات عامة | تحويل `rankings`, `undervalued`, `about`, `data-quality`, `premium`, `dashboard`, `compare`, `watchlist`, `portfolio` إلى غلاف Server + `client.tsx` مع metadata | كل الصفحات 200 |
| SEO | canonical لكل صفحة، إزالة canonical العام، `metadataBase`، OG/Twitter، JSON-LD، sitemap من قاعدة البيانات | 302 رابط، 0 cuid |
| الشركات | canonical/JSON-LD/sitemap برمز التداول، ودعم ticker/ISIN/cuid في API | `/company/COMI` و`/api/v1/companies/COMI` 200 |
| الصفحات الرفيعة | الشركات بلا قيمة موثوقة `noindex, follow` ومستبعدة من sitemap | 8 شركات |
| القطاعات | `/sectors` و`/sectors/[sector]` Server-rendered وقابلة للزحف | 18 قطاعاً |
| الخصوصية | صفحة `/privacy` ثنائية اللغة + رابط في الفوتر + sitemap | 200 |
| الأمان | CSP/HSTS/X-Frame/nosniff/Referrer/Permissions، منع `unsafe-eval` في الإنتاج، إخفاء `X-Powered-By` | headers verified |
| الواجهة | إزالة إشعارات وهمية، إحصاءات بديلة مخترعة، وحوار مصدر القيمة | build + grep |
| البيانات | إصلاح أسعار `undervalued` (أحدث لقطة)، حارس تقييم متطرف، عزل تقرير SIPC المخلوط | API verified |
| التشغيل | `start-standalone.mjs` ينسخ `public/` و`.next/static`، `instrumentation.ts` يدفئ الكاش | standalone 200 |

### J.2 أرقام الإنتاج / Production numbers

- الشركات: **282 نشطة / 297 إجمالاً**.
- التقارير الموثوقة: **6,814**.
- القيم `VALID`: **80,959**؛ `NEEDS_REVIEW`: **18,964**.
- الأحداث المالية: **4,265**؛ التوزيعات: **0**.
- لقطات الأسعار: **12,154**؛ أحدث لقطة **2026-09-30**.
- الشركات ذات تقرير سنوي: **270/282**.
- ISIN: **242/282 (85.8%)**؛ الأسهم القائمة: **235/282 (83.3%)**.
- التدقيق الأخير `cmw0twy590000bxm40tme08da`: **2,116** (86 critical / 324 high / 727 medium / 979 low).

### J.3 الجودة / Quality gates

| Gate | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm test` | ✅ 10 ملفات / 80 اختباراً |
| `npm run build` | ✅ Next 16.3.2 standalone |
| Smoke (25 صفحة + 12 API) | ✅ 200 |
| Security headers | ✅ |
| Sitemap | ✅ 302 (274 شركة + 18 قطاع + 10 ثابتة) |
| Zero future periods in latest-results | ✅ 0/12 |

### J.4 الأداء / Performance

- الصفحات الدافئة: `/` ~180ms، `/sectors/Banks` ~640ms، `/company/COMI` ~530ms، `/rankings` ~80ms.
- APIs الدافئة: dashboard ~110–170ms، rankings ~260–305ms، financials ~110ms، ticker ~115ms، undervalued ~1.0s.
- البداية الباردة: dashboard ~2.2s، company API ~6–8s (دفء سياقات المسح)؛ `instrumentation.ts` يدفئها عند الإقلاع.
- المخاطر: لا CDN/edge cache ولا readiness probe؛ أول زائر أثناء الدفء يدفع الثمن.

### J.5 التنظيف / Cleanup

- حُذف **32** ملف probe/debug مؤقت من `scripts/_*` و`.build.log` بعد التأكد من عدم الاعتماد عليها.
- لم تُحذف أي migration أو اختبار أو config أو ملف أساسي.
- سكربتات الاستعادة والعزل الجديدة موثقة وقابلة لإعادة التشغيل: `quarantine-mixed-company-report.mjs`, `recover-*`, `validate-askborsa-fills.mjs`, `quarantine-annual-copies.mjs`.

### J.6 المتبقي / Remaining

86 critical و18,964 حالة مراجعة و8 شركات بلا بيانات و12 شركة بلا تقرير سنوي و0 توزيعات وأسعار بتاريخ 2026-09-30. التفاصيل في `reports/launch-readiness.md`.

---

## K. جولة المعالجة النهائية — 2026-11-03 / Final remediation pass

### K.1 ما تغيّر هندسياً / Engineering changes

- **تصنيف التدقيق:** فجوات `ASSET_COMPONENTS` و`DEBT_COMPONENTS` والتدفق النقدي المتوافق مع حركة النقد أصبحت `coverage`/`high` بدلاً من `blocker`. صافي التغير الذي **يتعارض** مع حركة النقد يبقى `blocker`.
- **حارس التدفق النقدي:** تمييز صريح بين `corroborated` (صافي التغير مطابق) و`contradicted` (متعارض) و`unknown` (حركة النقد غير مخزنة)، مع رسائل ثنائية اللغة.
- **اختبار انحدار:** اختبار جديد يثبت أن الحالة المتوافقة `coverage`/`high` والمتعارضة `blocker`/`critical`. الإجمالي الآن **81/81**.
- **أداة التدقيق:** `scripts/run-audit.ts` يطبع الآن `byClass` وعدد `blocker` ويُدرج كل حالات `blocker` الخطيرة والمرتفعة.
- **سكربتات معالجة قابلة للتراجع:** `quarantine-balance-sheet-failures.mjs`, `fix-pbt-tax-failures.mjs`, `fix-critical-identities.mjs`, `quarantine-high-blockers.mjs`, `quarantine-cashflow-outliers.mjs` — كلها تدعم dry-run / apply / rollback.

### K.2 أرقام الإنتاج المحدثة / Updated production numbers

- الشركات: **276 نشطة / 297 إجمالاً**.
- التقارير الموثوقة: **6,803**.
- الشركات ذات تقرير سنوي: **271/276**.
- القيم `VALID`: **80,215**؛ `NEEDS_REVIEW`: **19,015**.
- المقاييس المحسوبة: **270,783**؛ الأحداث المالية: **4,235**؛ التوزيعات: **0**.
- ISIN: **93.5%**؛ الأسهم القائمة: **91.7%**.
- الشركات ذات سعر: **260**؛ قديم >7 أيام: **1**؛ بلا سعر: **16**.
- أحدث تدقيق `cmw0ynprx0000bxs4jc3tp4im`: **1,974** (42 critical / 292 high / 691 medium / 949 low).
- **blocker class: 0 critical / 0 high.** الـ42 «critical» كلها `coverage` (REVENUE/NET_PROFIT مفقود أو معزول).

### K.3 بوابات الجودة / Quality gates

| Gate | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ clean |
| `npm run lint` | ✅ clean |
| `npm test` | ✅ 10 ملفات / 81 اختباراً |
| `npm run build` | ✅ Next 16.3.2 standalone |
| Security headers | ✅ |
| Sitemap | ✅ 303 (275 شركة + 18 قطاع + 10 ثابتة) |
| Zero future periods in latest-results | ✅ 0/12 |

### K.4 التنظيف / Cleanup

- حُذفت كل ملفات `scripts/_tmp-*` (35 ملفاً) و`reports/_mubasher-*.html` و`reports/_names.txt` بعد التأكد من عدم وجود أي اعتماد عليها في `package.json` أو `src/` أو سكربتات الإنتاج.
- لم تُحذف أي migration أو اختبار أو config أو ملف أساسي.
- سكربتات المعالجة والتراجع الجديدة باقية كأثر تدقيق قابل لإعادة التشغيل.

### K.5 المتبقي / Remaining

- 42 فجوة تغطية حرجة (REVENUE/NET_PROFIT).
- 19,015 قيمة معزولة.
- 284 فجوة هوية review-only، 305 نسخة سنوية بقيمة واحدة.
- KORA بلا قوائم؛ 6 شركات معطّلة reversibly.
- لا أسعار لحظية مرخصة، ولا توزيعات، ولا نسخ احتياطي/مراقبة/دفع إلكتروني.

### K.6 التشغيل / Operations tooling

- `scripts/backup-db.mjs`: نسخة متسقة عبر `VACUUM INTO` + `PRAGMA integrity_check`، تقليم بعد 14 نسخة، ودعم `--keep` / `--dry-run`. أول نسخة: 284,172,288 بايت، `integrity=ok`.
- `scripts/restore-db.mjs`: استعادة صريحة مع نسخة أمان `pre-restore-*.db`، ورفض بدون `--yes`.
- `scripts/healthcheck.mjs`: فحص 4 أسطح (`/api/v1/health`, `/api/v1/market/ticker`, `/api/v1/companies/COMI`, `/`)، كود خروج غير صفري عند الفشل، ويكتب `reports/healthcheck.json`.
- أوامر npm: `npm run backup`, `npm run restore`, `npm run healthcheck`.
- `.env` المحلي يحتوي الآن على `ADMIN_PASSCODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` (القيم لا تُطبع). `.env*` مستثنى من git.
- دليل التشغيل: `reports/operations-runbook.md` (نسخ/استعادة/مراقبة/أسرار/استجابة حوادث).
- المتبقي: ربط مراقبة خارجية (UptimeRobot/Better Stack) وSentry/APM، وCI/CD، وتمرين استعادة موثّق شهرياً.
