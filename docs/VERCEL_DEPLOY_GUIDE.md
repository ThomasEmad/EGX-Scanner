# 🚀 دليل نشر موقع EGX Scanner على Vercel — مجاني 100%

> إجمالي التكلفة: **0 جنيه/دولار** — استضافة مجانية + قاعدة بيانات مجانية + SSL تلقائي + لينك حقيقي فوراً.
> الوقت المطلوب منك: **15-20 دقيقة** (إعداد الحسابات والنسخ واللصق).

---

## ماذا جهّزنا في الكود؟ (تم بالفعل ✅)

| التعديل | الحالة |
|---|---|
| قاعدة البيانات تدعم Turso السحابية تلقائياً (نفس SQLite بدون أي تغيير في البيانات) | ✅ مُختبَر |
| الذكاء الاصطناعي يشتغل بمفتاح API خارجي (Gemini المجاني أو GLM) بدل بيئة الساندبوكس | ✅ مُختبَر |
| توليد عميل Prisma تلقائياً عند النشر (postinstall) | ✅ |
| سكريبت رفع المخطط + الـ seed للـ Turso | ✅ جاهز |
| حماية الكود من نظام الملفات للقراءة فقط في Vercel | ✅ |
| حزمة الكود نظيفة وجاهزة: `egx-vercel-deploy.zip` | ✅ |

---

## الخطوة 1️⃣ — الحسابات (أنشئها بنفسك، كلها ببلاش)

سجّل دخول بحساب جوجل، بترتيب دقائق لكل واحد:

1. **GitHub** — https://github.com/signup
2. **Vercel** — https://vercel.com/signup ← اختر "Continue with GitHub"
3. **Turso** — https://turso.tech ← زر Sign up (اختر GitHub login)
4. **Google AI Studio** — https://aistudio.google.com (لمفتاح الذكاء الاصطناعي المجاني)

---

## الخطوة 2️⃣ — رفع الكود على GitHub

### الطريقة الموصى بها (أسرع — 5 دقائق):
1. من حساب GitHub: اضغط **+** (فوق يمين) → **New repository**
2. الاسم مثلاً: `egx-scanner` — اختر **Private** — **متحقق من خيار README ولا تشغله** (repo فاضي) → Create
3. اعمل مفتاح وصول Temporary:
   - GitHub → Settings → Developer settings → Personal access tokens → **Tokens (classic)** → Generate new token (classic)
   - Note: `vercel-deploy` — Expiration: **7 days** — علّم على `repo` فقط → Generate
   - انسخ التوكن (يبدأ بـ `ghp_`)
4. **ابعتلي في الشات: اسم مستخدم GitHub + التوكن** → أنا أرفع الكود كاملاً من هنا فوراً (1245 ملف — الرفع اليدوي بالويب صعب لهذا العدد)
5. بعد ما أنا أرفع وأتأكد: **امسح التوكن من GitHub** (Delete في صفحة التوكنات)

> ملاحظة أمان: التوكن مؤقت وصلاحيته 7 أيام ويمكنك إلغاؤه في أي لحظة، ولا يمنح أي صلاحيات غير الكود.

### الطريقة اليدوية (لو تفضّل عدم إرسال توكن):
تحتاج Git مثبت على جهازك — فك ضغط `egx-vercel-deploy.zip` ثم:
```bash
cd egx-vercel-deploy
git init && git add . && git commit -m "EGX Scanner - Vercel ready"
git remote add origin https://github.com/USERNAME/egx-scanner.git
git branch -M main
git push -u origin main
```

---

## الخطوة 3️⃣ — إنشاء قاعدة بيانات Turso (3 دقائق)

1. ادخل https://turso.tech → Dashboard
2. **Create database** → الاسم: `egx-prod` — Location: الأقرب لمصر (مثلاً `fra` أو `mad`) → Create (الخطة Free)
3. من صفحة الداتابيز افتح تبويب **Connect / Tokens** وانسخ اتنين:
   - **Database URL** — يبدأ بـ `libsql://`
   - **Database Token** — نص طويل → اضغط "Create token" لو مش موجود
4. **ابعتلي الاتنين في الشات** → أنا ساعتها أنقل **كل بياناتك الحالية فوراً**:
   - جاهز معي نسخة كاملة من قاعدة بياناتك (`egx-turso-dump.sql.gz`)
   - فيها: **297 شركة + 12,100 تقرير مالي + 283,950 قيمة مالية موثقة + 496,071 مؤشر محسوب + أسعار السوق + المستخدمين والاشتراكات**
   - الاستيراد نفسه مُختبَر بالكامل: ~940 ألف سجل في دقائق بذاكرة ثابتة
   - 📌 الجداول الحساسة فقط مش هتتنقل (الجلسات المفتوحة + توكنات استعادة كلمة السر) — يعني كل المستخدمين هيسجلوا دخول من جديد، وأسرارهم مش هتتنقل أبداً

> بديل يدوي للمتقنين (لو مش هتبعتلي التوكن):
> ```bash
> export TURSO_DATABASE_URL="libsql://egx-prod-USERNAME.turso.io"
> export TURSO_AUTH_TOKEN="eyJ..."
> npm install && npm run db:push:turso && bun prisma/seed.ts   # قاعدة جديدة فاضية بالسجل الكامل
> # أو انقل بياناتك الفعلية:
> node scripts/import-dump-turso.mjs egx-turso-dump.sql.gz
> ```

---

## الخطوة 4️⃣ — مفتاح الذكاء الاصطناعي المجاني (دقيقتان)

1. ادخل https://aistudio.google.com
2. زر **Get API key** → Create API key → انسخ المفتاح (يبدأ بـ `AIza`)
3. ده المفتاح اللي هتحطه في Vercel باسم `AI_API_KEY` — مجاني وسخي جداً لتحليلات موقعك

> بديل: GLM من https://open.bigmodel.cn (موديل glm-4-flash) — حط وقتها في Vercel:
> `AI_BASE_URL=https://open.bigmodel.cn/api/paas/v4/` و `AI_MODEL=glm-4-flash`

---

## الخطوة 5️⃣ — الاستيراد في Vercel (5 دقائق)

1. https://vercel.com/new → اضغط **Import** جنب repo `egx-scanner`
2. Framework Preset هيتكتشف تلقائياً: **Next.js** — سيبه زي ما هو
3. **قبل ما تضغط Deploy**: افتح **Environment Variables** (تحت)، وأضف واحد واحد:

| الاسم | القيمة | ملاحظة |
|---|---|---|
| `DATABASE_URL` | `file:./db/unused.db` | قيمة ثابتة — انسخها زي ما هي |
| `TURSO_DATABASE_URL` | `libsql://egx-prod-…turso.io` | من Turso |
| `TURSO_AUTH_TOKEN` | `eyJ…` | من Turso |
| `ADMIN_PASSCODE` | `4431839a611b3d08d62415f6e7c1915f` | جاهز — انسخه |
| `CRON_SECRET` | `6c676ef713fe9f46c564ba4a4a05ad8bba2a57214f57a199c9367cb4852e3221` | جاهز — انسخه |
| `TRUSTED_PROXIES` | `*` | ضروري للـ rate limiting صح |
| `MAIL_PROVIDER` | `smtp` | |
| `SMTP_HOST` | `smtp.gmail.com` | |
| `SMTP_PORT` | `465` | |
| `SMTP_USER` | `tomasemad286@gmail.com` | |
| `SMTP_PASS` | `xmiqliobgmnsosnf` | App Password بتاعك |
| `MAIL_FROM` | `EGX Scanner <tomasemad286@gmail.com>` | |
| `AI_API_KEY` | `AIza…` | من الخطوة 4 |
| `NEXT_PUBLIC_SITE_URL` | *(أضِفها بعد أول Deploy)* | حط لينك الموقع اللي هيطلع |

> ⚠️ **متضفش** `NEXT_PUBLIC_TEMP_EDIT_MODE` في الإنتاج (ده وضع تجريبي للمراجعة).

4. اضغط **Deploy** — البناء 2-4 دقائق. لو نجح هيطلعلك **Congratulations** بلينك زي:
   `https://egx-scanner-xxxx.vercel.app`

5. **بعد أول deploy**: Settings → Environment Variables → عدّل `NEXT_PUBLIC_SITE_URL` وحط اللينك الجديد → Deployments → آخر deployment → **Redeploy** (عشان الإيميلات وروابط استعادة كلمة السر تستخدم اللينك الصح).

---

## الخطوة 6️⃣ — نقل بياناتك (أنا بعمله لو بعتلي توكن Turso)

لما تبعتلي `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` أنفّذ من هنا فوراً:
1. استيراد نسخة بياناتك الكاملة: `node scripts/import-dump-turso.mjs egx-turso-dump.sql.gz` (مُختبَر: 941 ألف سجل ✓)
2. اختبار قراءة/كتابة فعلي ومطابقة أعداد الجداول مع الأصل
3. أقولك "اتقفل" وساعتها بياناتك كلها على Turso

---

## الخطوة 7️⃣ — الصيانة الدورية المجانية (3 دقائق)

1. سجل حساب مجاني في https://cron-job.org
2. Create cronjob:
   - **URL**: `https://LInk-Mositek.vercel.app/api/v1/cron/maintenance`
   - Method: **GET** — Schedule: يومياً (أي وقت)
   - **Headers**: أضف `Authorization` بقيمة `Bearer 6c676ef713fe9f46c564ba4a4a05ad8bba2a57214f57a199c9367cb4852e3221`
3. Save — هتنضف الجلسات والتوكنات القديمة والسجل يومياً تلقائياً

---

## الخطوة 8️⃣ — الاختبار النهائي (5 دقائق)

| الاختبار | المتوقع |
|---|---|
| افتح اللينك | الصفحة الرئيسية تفتح بـ HTTPS 🔒 |
| `/api/v1/health` | `{"status":"ok"}` أو رد سليم |
| تسجيل مستخدم جديد | يشتغل + إيميل ترحيب يوصلك على الجيميل |
| استعادة كلمة السر | إيميل فيه رابط آمن |
| تحليل ذكي لشركة عندها بيانات | تحليل كامل بمفتاح Gemini |
| دخول الأدمن `/admin` | بياسورد ADMIN_PASSCODE |

---

## بعدين (اختياري)

- **دومين حقيقي** (~11$/سنة): اشتريه من Namecheap/Cloudflare → في Vercel: Settings → Domains → Add → اتبع الخطوتين عند المسجّل. SSL تلقائي.
- **دخول بجوجل/فيسبوك**: مفاتيح OAuth مجانية — أنا أقولك الـ Redirect URIs بالظبط لما تطلبها.

---

## ⚠️ حدود الخطة المجانية — بصراحة كاملة

| الحد | التفصيل |
|---|---|
| Vercel Hobby | للاستخدام الشخصي/غير التجاري رسمياً — 100GB نقل/شهر (أكتر من كفاية للبداية) |
| عمليات الأدمن الثقيلة | سكريبتات الخلفية + OCR للـ PDFات مش هتشتغل على Vercel (بيئة serverless) — رفع القوائم يتصير بالتدرج أو نرجع لها لاحقاً على VPS |
| Rate limiting | لكل نسخة function منفصلة — يشتغل بس أقل تشدداً من سيرفر واحد |
| Turso Free | 5GB تخزين + 500 مليون قراءة/شهر — موقعك حالياً بعيد جداً عنها. (Turso اتباعت لـ Supabase بس الخدمة والخطة مجانية كماهي) |
| الذكاء الاصطناعي | لو Gemini خلصت حصته المجانية، التحليل يرجع تلقائياً للوضع الاحتياطي (تحليل قواعدي) — الموقع مبيتوقفش |

---

## ملخص شات سريع — إيه اللي هتبعتهولي؟

1. **اسم مستخدم GitHub + توكن `ghp_…`** → أنا أرفع الكود (وبعدين تمسح التوكن)
2. **`libsql://…` + توكن Turso `eyJ…`** → أنا أرفع المخطط والـ seed
3. قولي "خلص" → أنت تكمل Import في Vercel بالجدول فوق
