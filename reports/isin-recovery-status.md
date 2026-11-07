# حالة استعادة ISIN — Meza / ISIN recovery status

**التاريخ / Date:** 2026-11-03  
**المصادر المستخدمة / Sources used:** TradingView public EGX ticker pages, Mubasher public company pages, AskBorsa public company pages, official filings where available.  
**القاعدة / Rule:** لا تُملأ قيمة ISIN إلا بعد التحقق من ISO 6166 (checksum)، وعدم التكرار، وتطابق الاسم (إنجليزي/عربي)، ومن صفحة عامة مسموح بها. لا تجاوز للمصادقة أو الجدران المدفوعة.

---

## 1. الملخص / Summary

| Metric | Value |
|---|---:|
| Active companies | 276 |
| Companies with ISIN | 258 (93.5%) |
| Missing ISIN | 18 (6.5%) |
| Filled by TradingView recovery (earlier) | 17 |
| Rejected (name mismatch) | 2 |
| Deferred (dual-line ambiguity) | 1 |
| No public TradingView page (404) | 15 |

---

## 2. المفقودون / Missing ISINs

### 2.1 لا توجد صفحة TradingView عامة (404) — 15 شركة

`ACRO, AIHC, ARPI, ARVA, DIFC, ESRS, GETO, GOCO, NAPR, NCEM, NOAF, PTCC, SIMO, TRST, UASG`

**السبب / Reason:** لا توجد صفحة عامة لهذه الرموز على TradingView (404). صفحات Mubasher وAskBorsa العامة لا تعرض حقل ISIN. لا يوجد مصدر عام ثانٍ يطابق الاسم ويحمل ISIN صالحاً.

**المطلوب / Next step:** جلب ISIN من مستند رسمي (قائمة EGX، تقرير سنوي، نشرة إصدار) أو من مزوّد مرخّص. لا يُستنتج ISIN من الاسم أو من رقم مشابه.

### 2.2 مرشحون مرفوضون — عدم تطابق الاسم

| Ticker | TradingView ISIN | Checksum | Name overlap | القرار / Decision |
|---|---|---|---|---|
| LUTS | `EGS07661C019` | ✅ | ❌ | مرفوض — الصفحة لا تطابق الشركة المحلية |
| MMAT | `EGS70P91C010` | ✅ | ❌ | مرفوض — الصفحة لا تطابق الشركة المحلية |

**السبب / Reason:** checksum صالح لا يكفي؛ يجب أن يتطابق الاسم. الصفحتان تشيران إلى شركة أخرى أو إلى رمز مختلف.

### 2.3 مؤجل — ازدواج خط العملة

| Ticker | TradingView ISIN | Checksum | Description | القرار / Decision |
|---|---|---|---|---|
| VLMR | `EGS69082C013` | ✅ | Valmore Holding | مؤجل |

**السبب / Reason:** الاسم المحلي `VLMR` عنصر نائب (placeholder)، والشركة الشقيقة `VLMRA` (Valmore Holding-EGP) لديها بالفعل `EGS69081C023`. الصفحة قد تمثل خطاً بعملة مختلفة (USD) وليس نفس الأداة. لا يُملأ ISIN بدون تأكيد رسمي للعلاقة بين `VLMR` و`VLMRA`.

**المطلوب / Next step:** تأكيد من EGX/الإفصاح الرسمي أن `EGS69082C013` يخص `VLMR` (الخط بالدولار) وليس شركة أخرى؛ ثم تحديث الاسم إن لزم.

---

## 3. ما تم التحقق منه / Verified fills (earlier)

- 17 ISINs filled from TradingView exact EGX ticker pages after checksum + duplicate + name-overlap checks.
- 5 placeholder names improved from the same pages.
- Rollback: `reports/isin-recovery-tradingview-rollback.json`.
- Full candidate log: `reports/isin-recovery-tradingview.json`.

---

## 4. الأثر / Impact

- **لا يؤثر على صحة القوائم المالية**: ISIN معرّف أداة، وليس قيمة محاسبية.
- يؤثر على البحث/الربط/التحقق من الهوية، وعلى أي تكامل مستقبلي مع مزوّد خارجي.
- الصفحات التي بلا ISIN تعرض `—` ولا تُخفي الشركة.

---

## 5. القاعدة المستمرة / Standing rule

1. لا تُملأ ISIN من مصدر غير عام أو يتطلب تجاوز مصادقة.
2. يجب أن يطابق الاسم الإنجليزي/العربي بدرجة كافية (Jaccard/overlap) وليس الرمز فقط.
3. يجب أن يمر checksum ISO 6166 وألا يكون مكرراً لشركة أخرى.
4. كل تعبئة تُسجل في ملف rollback وتظل قابلة للاستعادة.
5. الحالات الغامضة تبقى `NULL` مع توثيق، ولا تُخمّن.
