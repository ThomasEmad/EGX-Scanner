# دليل الـ Deploy — Meza

النشر الإنتاجي لتطبيق Next.js 16 (standalone) + Prisma/SQLite. كل الأوامر على Ubuntu 22.04/24.04 كمثال.

## الحالة الدائمة على القرص (خذ نسخة احتياطية منها)

| المسار | المحتوى |
|---|---|
| `db/custom.db` | قاعدة بيانات SQLite (الشركات، القوائم الموثقة، المستخدمون، الاشتراكات) |
| `storage/ingested/` | المستندات المرفوعة/المستخرَجة |
| `reports/` | سجلات عمليات الأدمن (logs + journal) |

---

## المتطلبات المشتركة

- Node.js **20+** (`node -v`)
- الملف السري لتحليل الذكاء الاصطناعي: `.z-ai-config` — ضعه في `/etc/.z-ai-config` على السيرفر:
  ```bash
  scp .z-ai-config server:/etc/.z-ai-config && chmod 600 /etc/.z-ai-config
  ```
  (الـ SDK يبحث في `./` ثم `~/` ثم `/etc` — وضعه في `/etc` مع صلاحيات 600.)

## ملف البيئة

```bash
cp .env.example .env   # ثم عبّي القيم الحقيقية
```

| المتغير | إلزامي؟ | الغرض |
|---|---|---|
| `DATABASE_URL` | ✅ | مسار SQLite، مثال `file:/home/deploy/meza/db/custom.db` |
| `ADMIN_PASSCODE` | ✅ | باس كود دخول لوحة الأدمن |
| `CRON_SECRET` | ✅ للمهام المجدولة | حماية `/api/v1/cron/*` عبر `Authorization: Bearer` |
| `NEXT_PUBLIC_SITE_URL` | ✅ | رابط الموقع العام (SEO/sitemap/OG) |
| `TRUSTED_PROXIES` | ⬜ | إذا وضعت nginx على نفس السيرفر: `"127.0.0.1"` (أو `"*"` لبوابة واحدة موثوقة). فارغ = تجاهل `x-forwarded-for` تماماً |
| `NEXT_PUBLIC_TEMP_EDIT_MODE` | ⬜ | وضع التحرير التجريبي — خلّيه فارغ في الإنتاج |

---

## الطريقة A — Docker Compose (الأسرع)

```bash
# على جهازك: انقل المشروع للسيرفر (بدون node_modules و.next)
rsync -az --exclude node_modules --exclude .next --exclude db ./ server:~/meza/

# على السيرفر
cd ~/meza
mkdir -p db storage reports
# لو عندك بيانات موجودة:  rsync -az db/custom.db server:~/meza/db/
cp .env.example .env && nano .env
docker compose up -d --build

# تحقق
curl http://localhost:3000/api/v1/health   # {"status":"ok"...}
```

- أول تشغيل بدون قاعدة بيانات → الـ entrypoint يشغّل `prisma migrate deploy` تلقائياً.
- البورت منشور على `127.0.0.1:3000` فقط — ضع nginx/caddy أمام الحاوية للـ TLS.
- الـ `.z-ai-config` يُمرَّر للـ container من `/etc/.z-ai-config` (عدّل الـ mount في `docker-compose.yml` لو مكانك مختلف).

## الطريقة B — تشغيل مباشر + systemd

```bash
# 1) الكود والاعتمادات
rsync -az --exclude node_modules --exclude .next --exclude db ./ server:~/meza/
cd ~/meza
mkdir -p db storage reports
cp .env.example .env && nano .env
npm ci
npm run build          # لو الذاكرة محدودة: NODE_OPTIONS="--max-old-space-size=1500" npx next build --webpack
npm start              # يشغّل standalone ويحمّل .env تلقائياً
```

خدمة systemd:

```ini
# /etc/systemd/system/meza.service
[Unit]
Description=Meza (Next.js standalone)
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/meza
ExecStart=/usr/bin/node scripts/start-standalone.mjs
Environment=NODE_ENV=production
Environment=PORT=3000
Restart=always
RestartSec=5
# حماية أساسية
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=/home/deploy/meza/db /home/deploy/meza/storage /home/deploy/meza/reports /etc/.z-ai-config

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now meza
systemctl status meza && journalctl -u meza -f
```

## nginx أمام التطبيق (TLS)

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;
  # شهادات certbot...
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;   # توليد التحليل الذكي قد يأخذ دقيقة
  }
}
```

> مهم: مع nginx على نفس السيرفر خُدّ `TRUSTED_PROXIES="127.0.0.1"` في `.env` وإلا حد الـ rate-limit سيعمل على IP داخلي واحد للكل.

---

## المهام المجدولة (cron)

```bash
# إعادة حساب المقاييس المشتقة لكل الشركات النشطة — مثلاً كل ساعة:
0 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://127.0.0.1:3000/api/v1/cron/recompute > /dev/null

# تدقيق البيانات اليومي:
30 3 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" "http://127.0.0.1:3000/api/v1/cron/audit?type=daily" > /dev/null
```

## النسخ الاحتياطي والتحديث

```bash
# نسخة احتياطية (سكربت جاهز):
npm run backup          # أو مع Docker: docker compose exec app node scripts/backup-db.mjs

# تحديث نسخة جديدة:
git pull   # أو rsync الجديد
npm ci && npm run build && sudo systemctl restart meza
# مع Docker:  docker compose up -d --build

# تحديث قاعدة البيانات بعد تغيّر الـ schema:
npx prisma migrate deploy

# ⚠️ لو قاعدة البيانات القديمة اتعملت بـ `db push` قبل ما نبدأ نستخدم migrations
# (يعني مفيش جدول _prisma_migrations)، أول migrate deploy هيرمي خطأ P3005.
# Baseline مرة واحدة: علّم المايجريشن الأولى كمنفذة ثم نزّل الباقي:
#   npx prisma migrate resolve --applied 20261029205827_init
#   npx prisma migrate deploy
```

## فحص الصحة

```bash
npm run healthcheck                       # سكربت جاهز
curl -s http://127.0.0.1:3000/api/v1/health
```

## استكشاف أخطاء سريع

| العَرَض | السبب المحتمل / الحل |
|---|---|
| 500 على أي API يلمس البيانات | `DATABASE_URL` غير محمّل أو المسار غلط — الـ launcher يطبع مفاتيح الـ env المحمّلة عند البداية |
| التحليل الذكي يظهر «وضع بديل» | ملف `/etc/.z-ai-config` مفقود أو صلاحياته ليست 600 |
| كل المستخدمين يشاركان نفس حد المعدل | `TRUSTED_PROXIES` فاضي مع وجود بروكسي أمامي |
| الصفحات تفتح لكن الخطوط/الصور ناقصة | ثوابت الـ static لم تُنسخ — استخدم `npm start` (يعمل النسخ تلقائياً) لا `node server.js` مباشرة |
