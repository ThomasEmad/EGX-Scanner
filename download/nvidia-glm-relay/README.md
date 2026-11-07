# تغيير مزود الذكاء الاصطناعي إلى GLM على NVIDIA — التقرير النهائي

**التاريخ:** 2026-11-06 · **الموقع:** https://egx-scanner-ashy.vercel.app

---

## ما تم إنجازه ✅

1. **إعداد مزود NVIDIA بالكامل** (كود + env — مؤكد بالقيم الفعلية من Vercel):
   - `AI_API_KEY` = مفتاحك (nvapi-…، 72 حرف)
   - `AI_BASE_URL` = `https://integrate.api.nvidia.com/v1`
   - `AI_MODEL` = `z-ai/glm-5.3-flash`
   - `AI_MODEL_FALLBACK` = `deepseek-ai/deepseek-v4.1-flash` (مُختبر ويعمل على NVIDIA)
   - provider.ts جاهز: streaming SSE + تجاوز `reasoning_content` + خطة محاولات ميزانية (أساسي → إعادة → احتياطي) داخل maxDuration.

2. **المفتاح نفسه سليم 100%** — مُختبَر من بيئة التطوير: رد 200 في ~1 ثانية بنفس الطلبات (صغير و42KB وstreaming وغير streaming).

3. **اكتشاف وإصلاح 3 مشاكل إنتاجية جذرية** ظهرت أثناء الاختبار:

   | المشكلة | السبب الجذري | الإصلاح |
   |---|---|---|
   | 500 HTML بدل JSON | لا يوجد try/catch خارجي في routes الـ AI | تغليف GET/POST بواجهات محصّنة ترجع JSON 503 |
   | انهيار Turso (`Resource exhausted: mem_hrana_response`) + OOM في Vercel | استعلامات CalculatedMetric بدون select (2403 صف/شركة × 147 ألف صف إجمالاً) + warm-up سوقي عملاق عند إقلاع **كل** function instance (4 فحوصات كاملة × 297 شركة ≈ 1GB) | select خفيف + cursor pagination (1200/صفحة) في fetchCalc/scores/scan-service + تعطيل warm-up على Vercel |
   | `cursor: {id: undefined}` يعلّق Prisma | select بلا `id` مع cursor pagination | إضافة `id` للـ select (مُختبَر: بناء الـ snapshot كامل في **2.1 ثانية** بدل تعليق أبدي) |

4. **النتيجة على الإنتاج الآن** (مُختبَر E2E فعلياً):
   - الصحة: `dbLatencyMs` من 6252ms → **19ms**، صفر OOM kills.
   - تحليل AI: HTTP 200 + JSON سليم (rule-based مؤقتاً — انظر أدناه).
   - محادثة المحلل: JSON 502 رشيق بدل HTML 500.
   - المسارات الثقيلة كلها سريعة: `/rankings` 2.9s، `/sectors` 0.16s، الرئيسية 0.63s.

---

## العقبة الوحيدة المتبقية ❌→🔑

**NVIDIA تحجب egress بتاع Vercel على مستوى الشبكة** — مُثبت بأربع طرق مستقلة:

| الاختبار | النتيجة |
|---|---|
| Node function بمنطقة bom1 (مumbai) | timeout — صفر بايت |
| Node function بمنطقة iad1 (أمريكا) بعد تغيير منطقة المشروع | timeout — صفر بايت |
| `node:https` خام (تجاوز undici/fetch) | timeout — صفر بايت |
| Edge Function (شبكة hkg1/sin1) | timeout — صفر بايت |
| **التحكم** (GitHub API) من نفس الـ instances | **200 في 27-76ms** ✓ |
| نفس طلبات NVIDIA من بيئة التطوير | **200 في 0.17-1.5s** ✓ |

يعني: الطلبات لا تصل أصلاً (SYN مُهمَل بصمت بواسطة WAF NVIDIA على نطاقات IP السحابية الخاصة بـ Vercel). لا يمكن حلها من داخل Vercel بأي إعداد — يحتاج وسيط خارج Vercel.

**ملاحظة:** عادت المنطقة إلى bom1 (أقرب لقاعدة Turso في مumbai) بعد ما ثبت أن تغيير المنطقة لا يؤثر على NVIDIA إطلاقاً.

---

## خيارا التفعيل (عندما تقرر — التطبيق سليم ويعمل بالتحليل الاحتياطي حتى ذلك الحين)

### الخيار 1 (موصى به): Cloudflare Worker relay — مجاني، 5 دقائق
الملف الجاهز: `download/nvidia-glm-relay/worker.js` + الخطوات مكتوبة داخل تعليقات الملف.
1. حساب Cloudflare مجاني → Workers → Create Worker.
2. الصق محتوى `worker.js` → Deploy.
3. أرسل لي رابط الـ worker (`https://<name>.<subdomain>.workers.dev`) — سأغيّر `AI_BASE_URL` إليه وأعيد النشر، **ودون أي تعديل كود** (يحافظ على streaming والمفتاح).

### الخيار 2: مفتاح من مزود آخر متوافق مع OpenAI
أي مفتاح من (z.ai API / OpenRouter / bigmodel...) — أغيّر 3 متغيرات بيئة فقط وأعيد النشر.

---

## ملفات محفوظة للمرجع
- `scripts/patches/` — كل النسخ المرجعية المعدّلة (provider.ts, routes, statement-pref, scores, scan-service, instrumentation).
- `scripts/test-ai-e2e.sh` — اختبار E2E (يستخدم token موجود لتجاوز حد تسجيل 3/ساعة).
- السجلات الكاملة في AuditLog بقاعدة Turso (action=AI_ANALYSIS).
