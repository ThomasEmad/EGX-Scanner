# Multi-source coverage & verification playbook (runnable when network allows)

## الوضع الحالي (2026-09-26)
- 59/100 شركة ببيانات موثقة. الـ 41 الباقية مفيش رموزها على Yahoo/Reuters إطلاقًا.
- المصادر المجربة من جهاز المستخدم: Yahoo ✅ (yfinance) · Reuters ✅ (في الـ pipeline الأصلي)
  · stockanalysis.com ❌ Cloudflare محليًا، وجزئي التغطية من السيرفر + **خطر: الرموز الناقصة
  بيحوّلها لصفحات شركات تانية بدون تحذير** (VODE رجّعت VLMR) — ممنوع استيراده آليًا
  بدون مطابقة اسم صريحة · egx.com.eg ❌ محجوب محليًا + ECONNRESET من سيرفر الـ fetch.

## خطة الجلب متعدد المصادر (ترتيب حسب التكلفة)
1. **z-ai sandbox** (بيئة المستخدم القديمة — شبكتها تفتح المحجوب):
   `z-ai function -n page_reader` على egx.com.eg/en/stocksdata.aspx (قايمة Securities
   الرسمية: ticker + الاسم الرسمي + القطاع = تحقق جماعي) ثم لكل شركة ناقصة صفحة
   الـ financial highlights. الناتج → ملف بنفس schema الـ supplement → الاستيراد
   الحالي بيدمجه فورًا (`import-egx-data.cjs` يقرأ أي ملف في القايمة).
2. **stockanalysis.com من سيرفر خارجي** (فقط مع مطابقة اسم صريحة بعد الجلب —
   الدرس من VLMR): `/quote/egx/{T}/` overview + `/financials/`.
3. **PDF fallback**: صفحات IR للشركات المتبقية عبر مسار الرفع الموجود بالكامل.

## تحقق الأسماء المتعدد المصادر (per-company)
لكل شركة من الـ 100: قارن الاسم العربي والإنجليزي والقطاع ضد ≥2 من:
(أ) قايمة EGX الرسمية، (ب) صفحة Yahoo للرمز، (ج) stockanalysis، (د) بحث ويب.
أي تعارض → `CANONICAL_OVERRIDES` في import-egx-data.cjs + إعادة تشغيل + audit.
المصحح حاليًا (13): FWRY EFID RREI NREH EGAS BTFH ORWE SAIB CIEB AUTO→DOMTY
DSRB→SUGR EGCH→ECSC CAQA→CLHO PREDCO→PSFL MFPC→MOPCO.
**معلّق للتحقق (بحث انقطع):** MAAL/MMAT (نفس الاسم مرتين) · IRAX/ICID (نفس الاسم) ·
DSCW "Gadwa" (10 تقارير — النمط يوحي بـ Dice Sport & Casual Wear).

## Deltas بين المصادر (سطحها ولا تخفيها)
COMI إيراد FY2025: Yahoo 120.66B مقابل stockanalysis 128.54B — فرق عرض (TTM/منهجية
بنكية) — المقابل: عرض قيمة واحدة + توثيق المصدر، وأي تعارض >10% بين مصدرين يولّد
flag في الـ audit.

## اكتشاف 2026-09-26 (أحدث): خريطة رموز مباشر الداخلية
- دليل مباشر كامل محفوظ: egx-data/data/mubasher-egx-directory.json (240 صف: اسم عربي + كود مباشر + سعر)
- الكود الداخلي لمباشر مختلف عن Yahoo لبعض الشركات: بنك القاهرة=BQDC (مش BDCB) · مصر الكويت=MKIT (مش EKHO) · إسمنت سيناء=SCEM_r1 · القاهرة الوطنية=KWIN (مش موجودة عندنا أصلًا)
- IRAX = العز الدخيلة للصلب (اتصحح الاسم — كانت "الدولية للاستثمار" غلط) · ISPH = ابن سينا فارما (اتصلحت)
- صفحات القوائم المالية (/markets/EGX/stocks/{CODE}/financial-statements) SPA shell — البيانات وراء XHR بعد الرندر؛ الاستخراج يتطلب تفاعل DOM كامل لكل شركة (النمط مثبت في الجلسة: goto + waitForTimeout(7000) + extraction)
- الأولوية عند الاستكمال: BQDC, MKIT, MASR, KWIN, QNBA (كوده الداخلي محتاج اكتشاف من دليل الصفحات) ثم الباقي

## نتائج تجربة PDF extraction (2026-09-26)

| الشركة | المصدر | النتيجة |
|---|---|---|
| EZDK (عز) | ezzsteel.com/investor-relations/...financial-statements | ✅ PDF نزل (2.3MB سليم) — لكنه **ممسوح ضوئيًا** (صور بدون طبقة نص) → الـ pipeline صنّفه NEEDS_REVIEW صح. ينتظر OCR |
| DOMTY | ir.feedgfm.com/domty | ❌ SPA فارغة للأتمتة — البديل: domty.org إفصاحات يدويًا |
| نمط مثبت للتنزيل والرفع | curl -o + فحص %PDF- → POST /api/v1/reports (multipart مع periodEnd!) → /process → /approve | شغال 100% — أي PDF نصي من أي شركة يمر بنفس السلسلة |

**الحقيقة الفنية**: تقارير الشركات المصرية غالبها scanned Arabic PDFs — بدون OCR لن تستخرج آليًا. الشركات القليلة اللي نشرتها text-based (وُجدت في عز قديمًا) تمر مباشرة.
