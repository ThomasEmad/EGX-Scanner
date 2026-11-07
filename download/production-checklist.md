# 🚀 خطة الإنتاج — EGX Scanner (2026-11-06)

## ✅ جاهز للإنتاج — اتعمل واتأكد النهاردة

| # | البند | الحالة |
|---|---|---|
| 1 | **نظام env دائم** — المصدر الرسمي `download/config/env.production`، الـ watchdog يصلح أي تلف تلقائياً | ✅ |
| 2 | **تسجيل جوجل/فيسبوك (OAuth)** — كود كامل (سيرفر + أزرار UI + typecheck نظيف)، يشتغل فور وصول المفاتيح | ✅ كود فقط |
| 3 | **خدمة إيميل (SMTP + Resend)** — قوالب ثنائية اللغة RTL، استعادة كلمة السر برابط آمن + إيميل ترحيب. **شغّالة live على Gmail SMTP** (`tomasemad286@gmail.com`) — إيميل استعادة كلمة السر وصل فعلاً ومُؤكَّد في audit log `MAIL_SENT` | ✅ مُختبر live |
| 4 | **endpoint صيانة يومية** — `GET /api/v1/cron/maintenance` (Bearer CRON_SECRET): تنظيف sessions/tokens/audit + WAL checkpoint | ✅ مُختبر live |
| 5 | **SQLite للإنتاج** — WAL مفعّل + `busy_timeout=10s` + `connection_limit=10` + فهارس شاملة في الـ schema | ✅ |
| 6 | **Rate limiting صحيح** — `TRUSTED_PROXIES="*"` (كل مستخدم له bucket خاصته بدل bucket واحد مشترك) | ✅ |
| 7 | **إصلاحات إنتاجية** — favicon.ico (كان مفقود) + صفحات الـ 404 (كانت 500!) + بناء نظيف بكل الطرق | ✅ |
| 8 | **الحماية** — CSP + security headers + جلسات مشفرة 7 أيام + صفحات أخطاء لا تسرّب شيء + أدمن timing-safe | ✅ مدقّق |
| 9 | **دفع يدوي محصّن** — السعر من السيرفر حصراً + idempotency + key locks + مراجعة أدمن | ✅ |
| 10 | **بنية الحماية الذاتية v2** — watchdog كل 5 دقائق + استعادة tarball عند الكوارث + بناء بيئة صحيحة تلقائياً | ✅ مُختبر |
| 11 | **فحص شامل** — 25/25 مسار 200 + typecheck نظيف + نسخة مصدر `download/backup/egx-src-20261106.tar.gz` | ✅ |

## 🔴 مستحيل أعمله بمفردي — عليك أنت (بالترتيب)

### 1️⃣ دومين عام + HTTPS
الـ OAuth والـ SEO وروابط الإيميل كلها تحتاج دومين حقيقي.
- اشترِ دومين ووصّله بالسيرفر، ثم سجّله في `NEXT_PUBLIC_SITE_URL` بملف `download/config/env.production`

### 2️⃣ مفاتيح Google OAuth (10 دقائق)
1. [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → **OAuth consent screen** (External) → أنشئ
2. **Credentials → Create OAuth client ID → Web application**
3. Authorized redirect URIs: `https://دومينك/api/v1/auth/oauth/google/callback`
4. هات الـ **Client ID** و **Client Secret**

### 3️⃣ مفاتيح Facebook OAuth
1. [developers.facebook.com](https://developers.facebook.com) → Create App → **Consumer**
2. أضف Facebook Login → Settings → Valid OAuth Redirect URIs:
   `https://دومينك/api/v1/auth/oauth/facebook/callback`
3. هات الـ **App ID** و **App Secret**

### 4️⃣ ~~مفتاح Resend للإيميل~~ — ✅ تم بالبديل الأسرع
الإيميل شغّال الآن عبر **Gmail SMTP** بحسابك (`tomasemad286@gmail.com` + App Password) — مُختبر live ووصل فعلاً. لا حاجة لـ Resend إلا لو عايز إرسال بكميات كبيرة أو من دومينك الخاص لاحقاً (الكود بيدعم الاتنين تلقائياً: حط `RESEND_API_KEY` وهو يتحول لوحده).

### 5️⃣ بوابة دفع حقيقية (اختياري الآن)
التحويل اليدوي شغال وآمن. للتفعيل الآلي: Paymob أو Fawry أو Stripe — حساب تجاري + مفاتيح API.
نقطة الربط جاهزة: `POST /api/v1/payment-requests` + webhook تأكيد من الأدمن.

### 6️⃣ القرار التجاري: استضافة دائمة
الساندبوكس هنا للتجربة. للتشغيل الدائم 24/7 أمام 10 آلاف مستخدم: VPS أو Vercel.
الكود جاهز (`output: standalone` + DEPLOY.md موجود بالتفصيل).

## ⚙️ طريقة التسليم — ابعتلي المفاتيح وأنا أكمّل
انسخ القيم دي في `download/config/env.production` (أو ابعتها لي في الشات):
```
NEXT_PUBLIC_SITE_URL=https://دومينك
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
FACEBOOK_CLIENT_ID=...
FACEBOOK_CLIENT_SECRET=...
RESEND_API_KEY=...
MAIL_FROM="EGX Scanner <noreply@دومينك>"
```
وأنا فوراً: تشغيل → اختبار end-to-end للدخول الاجتماعي والإيميل → تقرير نهائي.
