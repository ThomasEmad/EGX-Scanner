# القضايا غير المحلولة — EGX Scanner / Unresolved issues

**التاريخ / Date:** 2026-11-03  
**النسخة / Version:** 0.3.0 (local, uncommitted)  
**الغرض / Purpose:** قائمة صريحة بكل ما لم يُحل، مع السبب والدليل والخطوة التالية. لا يُعتبر أي بند «محلولاً» لمجرد اختفائه من الواجهة.

> **الحالة الحرجة / Critical state:** لا توجد أي ملاحظة `blocker` خطيرة أو مرتفعة في آخر تدقيق. الـ42 ملاحظة «خطيرة» هي `coverage` (نقص تغطية)، وليست تناقضات محاسبية.

---

## 1. تغطية البيانات / Data coverage

### 1.1 الـ42 ملاحظة تغطية حرجة / 42 critical-severity coverage findings

آخر تدقيق: `cmw0ynprx0000bxs4jc3tp4im` — 1,974 ملاحظة (42 critical / 292 high / 691 medium / 949 low)، `blocker=0`, `coverage=637`, `advisory=1,318`, `metadata=19`.

| Metric | Companies | Tickers | Reason |
|---|---|---:|---|
| `REVENUE` — no value | 27 | APPC, ARPI, BIDI, CCRS, CRST, DCCC, DIFC, ELNA, FTNS, GETO, GGRN, GOCO, INEG, KORA, MISR, MKIT, NCGC, NHPS, NOAF, POCO, PTCC, SUCE, TRST, TRTO, UASG, UPMS, WATP | لا توجد قيمة موثوقة في أي فترة (غالباً بنك/تأمين/استثمار أو شركة جديدة) |
| `REVENUE` — quarantined only | 8 | ACAP, ARVA, BONY, DGTZ, EHDR, EPPK, MMAT, OIH | كل القيم معزولة (تكرار سنوي/خلط تقارير/فشل هوية) |
| `NET_PROFIT` — no value | 6 | AMII, EGREF, GTEX, KORA, NOAF, SIMO | لا توجد قيمة موثوقة في أي فترة |
| `NET_PROFIT` — quarantined only | 1 | APPC | كل القيم معزولة |

**لماذا لا تُملأ؟** لا يجوز استخدام الصفر أو التقدير. بعض هذه الشركات بنوك/تأمين لا تعرض «إيرادات» بالمعنى الصناعي، وبعضها جديد بلا قوائم. الحل: استخراج من القوائم الرسمية أو مصدر ثانٍ، أو وسمها `NOT_APPLICABLE` إذا كان المقياس غير منطبق على نموذج العمل (مثلاً بنك بلا `REVENUE`).

**الخطوة التالية:** مراجعة كل شركة على حدة؛ تحويل غير المنطبق إلى `NOT_APPLICABLE` مع سبب، وليس إلى صفر. هذا يقلل الـ42 دون اختلاق بيانات.

### 1.2 القيم المعزولة / Quarantined values

- **19,015** قيمة `NEEDS_REVIEW` من أصل **99,230** (19.2%).
- الأسباب: نسخ سنوية مكررة، تقارير مختلطة، فشل هويات محاسبية، تدفقات نقدية متناقضة، فترات مستقبلية، وبيانات مستخرجة بلا مصدر كافٍ.
- **لا حذف:** كلها قابلة للاستعادة عبر ملفات `reports/*-rollback.json`.

### 1.3 فجوات الهوية review-only / Review-only identity gaps

- **284** فجوة (248 تدفق نقدي، 36 ميزانية) لم تُعزل لأن الفجوة الموجبة قد تكون مشروعة (NCI، فروق عملة، بنود «أخرى»).
- **305** نسخة سنوية بقيمة واحدة فقط — تُركت للمراجعة لتجنب الإيجابيات الكاذبة.
- **الخطوة التالية:** مصدر ثانٍ لكل حالة؛ لا عزل جماعي.

### 1.4 الهوية والأسهم / Identifiers & shares

- **18** شركة بلا ISIN (6.5%): `ACRO, AIHC, ARPI, ARVA, DIFC, ESRS, GETO, GOCO, LUTS, MMAT, NAPR, NCEM, NOAF, PTCC, SIMO, TRST, UASG, VLMR`. التفاصيل في `reports/isin-recovery-status.md`.
- **23** شركة بلا عدد أسهم (8.3%).
- **BQDC:** Mubasher يقول 10,250,000,000 سهماً / 20.5B EGP رأس مال، لكن لا مصدر ثانٍ ولا سعر/قيمة سوقية قابلة للتحقق (Thndr NOPL، Mubasher 0.00). لم يُملأ.
- **VLMRA:** ثلاث قيم متضاربة (current 1,183,229,551؛ scanner 830,840,000؛ Mubasher 352,389,240). قيمة scanner تطابق `VLMR` (الخط بالدولار) وليس `VLMRA` (الخط بالجنيه). لم تُصحح.
- **تم حل 5 من 6 حالات مراجعة الأسهم:** FAIT → 225,910,908 وSEIG → 2,500,000 (Mubasher + TradingView متطابقان)؛ DTPP/EXPA/ORHD أُبقيت (Mubasher يطابق القيمة الحالية)؛ VLMRA unresolved. التقرير: `reports/shares-review-resolution.json`، rollback: `reports/shares-review-resolution-rollback.json`.

---

## 2. حالات بيانات محددة / Specific data cases

| Case | Status | Reason | Next step |
|---|---|---|---|
| **ECSC / EGCH** | غير محسوم | H1 2026: 1.794B (ECSC) مقابل 1.190B (EGCH Q1+Q2). لا مصدر ثانٍ يحسم إن كانا كيانين أو ازدواجاً | إفصاح رسمي/IR؛ لا دمج بالاستنتاج |
| **KORA** | نشطة بلا قوائم | إدراج حديث؛ بيانات السعر فقط (1.75 EGP) | انتظار القوائم؛ الصفحة `noindex` |
| **BQDC** | بلا أسهم | NOPL + تعارض السعر/القيمة السوقية | مصدر رسمي للأسهم/الرأس مال |
| **VLMRA / VLMR** | ازدواج خط عملة | ISINان مختلفان (EGS69081C023 / EGS69082C013) وثلاث قيم أسهم | تأكيد رسمي للعلاقة بين الخطين |
| **LUTS / MMAT ISIN** | مرفوض | TradingView ISIN بلا تطابق اسم | مصدر رسمي |
| **15 ISIN 404** | غير متاح | لا صفحة TradingView عامة | قائمة EGX/تقرير سنوي |
| **284 + 305 review-only** | مفتوح | فجوات محتملة مشروعة | مصدر ثانٍ لكل حالة |
| **AskBorsa mismatches** | مفتوح | EFIC, HELI, DAPH, ASPI, ATLC, MPRC, TAQA, HRHO, OFH, TMGH, DSCW, MCRO — تعارضات غير قابلة للحسم | Mubasher/Thndr/إفصاح |
| **12 AskBorsa fetch failures / 23 no pivots** | غير قابل لإعادة المحاولة غالباً | أسماء بديلة/شركات شطبت | توثيق كـ«لا مصدر عام» |

---

## 3. السوق والحداثة / Market data & freshness

- **لا يوجد مصدر لحظي مرخّص.** الأسعار من TradingView public scanner، **متأخرة 15 دقيقة** (`delayMinutes: 15`)، لقطة `2026-11-03T15:50:53.361Z`.
- **16** شركة بلا سعر، **1** شركة سعرها أقدم من 7 أيام، **55** شركة بياناتها أقدم من 365 يوماً.
- **0** سجل توزيعات أرباح. تمت إزالة عبارة «تتبع توزيعات» من صفحة «عن المنصة»؛ ميزة التقويم تبقى فارغة بصدق.
- **17** شركة نشطة بلا صف في TradingView scanner (ACRO, ARVA, AIHC, ESRS, GOCO, SIMO, NCEM, NAPR, NOAF, UASG, ECSC, ARPI, DIFC, GETO, MKIT, PTCC, TRST).
- **37** رمز TradingView غير مطابق، بعضها يشبه ISIN (`EGS30AJ1C016-EGP`, `EGS370O1C013`, …).

**الخطوة التالية:** مزوّد مرخّص باتفاقية SLA، أو الإبقاء على الوسم «لقطة سوق» وعدم الوعد باللحظية.

---

## 4. التشغيل / Operations

| Item | Status | Detail |
|---|---|---|
| Backup | ✅ scripts added | `npm run backup` — `VACUUM INTO` + `PRAGMA integrity_check`؛ أول نسخة 284,172,288 بايت، `integrity=ok` |
| Restore | ✅ scripts added | `npm run restore -- --from <db> --yes` مع نسخة أمان `pre-restore-*.db` |
| Health check | ✅ scripts added | `npm run healthcheck` — 4 أسطح، كود خروج غير صفري، `reports/healthcheck.json` |
| External uptime monitoring | ❌ غير مربوط | يحتاج UptimeRobot/Better Stack/cron خارجي |
| Error tracking / APM | ❌ غير مربوط | يحتاج Sentry أو ما يعادله |
| CI/CD | ❌ غير موجود | لا pipeline في المستودع |
| Secrets | ✅ محلياً | `ADMIN_PASSCODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` في `.env`؛ يجب تعيينها في بيئة النشر |
| Admin auth | ✅ تم اختباره | login صحيح 200 + cookie؛ خاطئ 401؛ `/admin/dashboard` 401 بلا cookie و200 معه |
| Cron auth | ✅ تم اختباره | بلا auth 401؛ secret خاطئ 401 |
| Premium access | ✅ تم اختباره | anon: events 403 / ai-analysis 401؛ free: events 403 / ai 200؛ premium: events 200 / ai 200 (حساب اختبار مؤقت حُذف) |
| Payment gateway | ❌ غير موجود | تفعيل يدوي عبر طلبات الدفع؛ لا بوابة إلكترونية |
| Legal review | ⚠️ غير مكتمل | Terms/Privacy/Disclaimer موجودة؛ تراخيص إعادة توزيع البيانات غير مؤكدة |
| Rate limiter | ⚠️ محدود | in-memory أحادي النسخة؛ `TRUSTED_PROXIES` فارغ |
| Backups off-site | ❌ غير موجود | النسخ محلية فقط؛ يجب نسخها إلى S3/R2/Backblaze |

---

## 5. ما تم إصلاحه ولا يظهر هنا / Fixed and verified

- **0 blocker-class** findings (0 critical / 0 high).
- 83 قيمة تدفق نقدي معزولة بعد مقارنة البنود + FX بحركة النقد؛ 34 حالة.
- 10 قيم ميزانية معزولة؛ 10 بنود PBT/ضريبة معزولة؛ 2 تصحيح إشارة ضريبة.
- EGAS تكبير 1e6×؛ NCEM تصحيح إشارة؛ 14 بنداً شاذاً معزولاً.
- SIPC FY2025: 24 قيمة معزولة؛ ROE −6.27%، ROA −3.93%.
- VLMR: 5 تقارير سنوية FY2021–FY2025 مستوردة؛ 135 مقياساً محسوباً.
- 6 شركات معطّلة reversibly (ECCW, EFOOD, MESF, PSFL, RPCO, VODE).
- 14 رمزاً مرادفاً معطّلاً reversibly.
- 5 تقارير مستقبلية / 25 قيمة معزولة؛ 2 تقارير FY2026 (EOSB, SUGR) معزولة.
- 851 تصحيح فترة مالية.
- 41,985 صفاً أُعيد تصنيف `statementType`.
- 3,219 قيمة Q4 موسومة `DERIVED`.
- FAIT/SEIG أسهم مصححة بمصدرين.

---

## 6. أولويات الإطلاق / Launch priorities

**P0 (قبل أي إطلاق مدفوع):**
1. ربط مراقبة خارجية + Sentry/APM + CI/CD.
2. تعيين الأسرار في بيئة النشر (وليس فقط `.env` المحلي).
3. نسخ احتياطي خارج الخادم + تمرين استعادة موثّق.
4. مصدر أسعار مرخّص/SLA أو تثبيت الوعد «لقطة متأخرة 15 دقيقة».
5. حل الـ42 تغطية الحرجة (أو تحويل غير المنطبق إلى `NOT_APPLICABLE` بسبب).
6. بوابة دفع أو نموذج فواتير رسمي + مراجعة قانونية.

**P1 (خلال 60 يوماً):**
- ISINs المتبقية، أسهم BQDC/VLMRA، حالات AskBorsa الغامضة.
- 284 + 305 review-only.
- توزيعات موثوقة أو إزالة أي وعد بها.
- hreflang عربي + Search Console/Bing.
- ملخصات تحريرية لكل شركة (مصدرها بيانات موثقة).

**P2 (تحسين):**
- pre-warming/CDN للـcold start.
- rate limiter موزّع + `TRUSTED_PROXIES`.
- تحسين الأداء والتغطية الإخبارية.

---

## 7. القاعدة / Standing rule

> لا يُغلق أي بند بالحذف أو التخمين. يُغلق فقط بـ: مصدر موثوق، أو عزل قابل للاستعادة مع سبب، أو وسم `NOT_APPLICABLE` مع تبرير. كل ما سبق موثق في `reports/` مع rollback.
