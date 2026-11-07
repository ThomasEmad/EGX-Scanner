# دليل التشغيل — Meza / Operations runbook

**آخر تحديث / Last updated:** 2026-11-03  
**النطاق / Scope:** التشغيل اليومي، النسخ الاحتياطي، الاستعادة، المراقبة، والأسرار.

> هذا الدليل لا يحتوي على أي أسرار. الأسرار تُقرأ من `.env` أو من بيئة النشر فقط.

---

## 1. الأسرار والبيئة / Environment & secrets

`.env` المحلي يحتوي على:

| Key | Purpose | Required in production |
|---|---|---|
| `DATABASE_URL` | SQLite `file:` URL | ✅ |
| `ADMIN_PASSCODE` | Admin console passcode (bcrypt-compared, fail-closed) | ✅ |
| `CRON_SECRET` | Bearer token for `/api/v1/cron/audit` | ✅ |
| `NEXT_PUBLIC_SITE_URL` | Canonical/sitemap/robots base URL | ✅ |
| `DB_QUERY_LOG` | `1` to log Prisma queries | optional |

**قواعد / Rules**

- `.env*` مستثنى من git. لا ترفع القيم إلى المستودع أو إلى المحادثات.
- في الإنتاج، عيّن القيم في منصة النشر (Vercel/Fly/Render/…)، لا في ملف داخل الصورة.
- إذا كان `ADMIN_PASSCODE` غير معيّن، تفشل لوحة الإدارة مغلقة (آمن). إذا كان `CRON_SECRET` غير معيّن، يُعطّل cron.
- غيّر `ADMIN_PASSCODE` و`CRON_SECRET` بعد أي تسريب أو عند تغيير المسؤولين.

```powershell
# محلياً: القيم موجودة في .env
Get-Content .env | Select-String '^(ADMIN_PASSCODE|CRON_SECRET|NEXT_PUBLIC_SITE_URL)='
```

---

## 2. النسخ الاحتياطي / Backups

**السكربت:** `scripts/backup-db.mjs` (يستخدم `VACUUM INTO` + `PRAGMA integrity_check`).

```powershell
npm run backup                 # يحتفظ بآخر 14 نسخة
npm run backup -- --keep=30    # يحتفظ بآخر 30
npm run backup -- --dry-run    # يعرض المسارات فقط
```

**ماذا يفعل؟**

1. يتحقق من `DATABASE_URL` أنه SQLite.
2. ينشئ نسخة متسقة في `backups/prisma-<UTC>.db` حتى لو كانت القاعدة مفتوحة.
3. يفتح النسخة كقاعدة مستقلة ويشغّل `PRAGMA integrity_check`.
4. لا يحذف النسخ القديمة إلا بعد نجاح النسخة الجديدة.
5. يطبع JSON: المسار، الحجم، نتيجة الفحص، والنسخ المحذوفة.

**الجدولة الموصى بها:** يومياً 02:00 UTC (خارج ساعات الذروة)، مع نسخة أسبوعية بعيدة عن الخادم (S3/R2/Backblaze).

```powershell
# Windows Task Scheduler (مثال)
schtasks /Create /SC DAILY /TN "Meza-Backup" /TR "cmd /c cd /d C:\path\to\Meza && npm run backup" /ST 02:00
```

**التحقق الدوري:** مرة شهرياً، استعد نسخة إلى قاعدة منفصلة (انظر القسم 3) وشغّل `npm run healthcheck`.

---

## 3. الاستعادة / Restore

> **أوقف الخادم أولاً.** على Windows يبقى ملف SQLite مقفلاً أثناء التشغيل.

```powershell
# 1) أوقف الخادم
Stop-Process -Id <PID> -Force

# 2) استعد (ينشئ نسخة أمان pre-restore-*.db تلقائياً)
npm run restore -- --from backups/prisma-2026-11-03T17-02-23-754Z.db --yes

# 3) شغّل الخادم وتحقق
npm start
npm run healthcheck
```

**ماذا يفعل؟**

1. يرفض العمل بدون `--yes`.
2. يتحقق من `integrity_check` للنسخة المرشحة.
3. ينسخ القاعدة الحالية إلى `backups/pre-restore-<UTC>.db`.
4. يستبدل القاعدة الحية، ثم يعيد `integrity_check`.
5. إذا فشل الفحص بعد الاستبدال، تُترك نسخة الأمان ويُطبع مسارها.

**تمرين استعادة / Restore drill (موصى به شهرياً):**

```powershell
# استعد إلى مسار مؤقت بدل القاعدة الحية
$env:DATABASE_URL="file:./backups/drill.db"
npm run restore -- --from backups/prisma-<latest>.db --yes
npm run healthcheck
Remove-Item .\backups\drill.db
```

> ملاحظة: `restore-db.mjs` يستخدم `DATABASE_URL` الحالي كهدف. لا تشغّل التمرين على القاعدة الحية.

---

## 4. المراقبة / Health checks

**السكربت:** `scripts/healthcheck.mjs`

```powershell
npm run healthcheck
$env:BASE_URL="https://meza-ashy.vercel.app"; npm run healthcheck
```

**يفحص:** `/api/v1/health`, `/api/v1/market/ticker`, `/api/v1/companies/COMI`, `/`.
**النتيجة:** كود خروج `0` عند النجاح، `1` عند أي فشل. يكتب `reports/healthcheck.json` (بدون أسرار).

**الجدولة الموصى بها:** كل 5 دقائق من خارج الخادم (UptimeRobot / Better Stack / Pingdom / cron على جهاز آخر). نبّه عند:
- كود خروج غير صفري،
- زمن استجابة > 5 ثوانٍ،
- فشل متكرر في `/api/v1/market/ticker` (قد يعني snapshot قديم).

**ما لا يغطيه:** لا يوجد APM/تتبع أخطاء مدمج. أضف Sentry (أو ما يعادله) قبل الإطلاق المدفوع، واربطه بـ `next.config.ts` عبر `@sentry/nextjs` أو DSN في بيئة النشر.

---

## 5. تحديث البيانات / Data refresh

| Task | Command | Notes |
|---|---|---|
| Recompute all derived metrics | `npx tsx scripts/recompute-all.mjs` | بعد أي تغيير في القيم الخام |
| Full audit | `npx tsx scripts/run-audit.ts` | يطبع `byClass` و`blocker` |
| Completeness baseline | `npx tsx scripts/data-completeness-audit.ts` | يكتب `reports/data-completeness-baseline.*` |
| Market snapshot | `node scripts/refresh-market-snapshot.mjs` | TradingView 15-min delayed |
| Scheduled audit (HTTP) | `POST /api/v1/cron/audit` مع `Authorization: Bearer $CRON_SECRET` | Vercel Cron أو scheduler |

**قاعدة ذهبية:** لا تشغّل سكربت `--apply` بدون مراجعة `--dry-run` أولاً، وتأكد من كتابة ملف rollback. كل سكربتات المعالجة في `scripts/` تدعم `--rollback` أو توثّق ملف التراجع.

---

## 6. استجابة الحوادث / Incident response

1. **تحقق من النطاق:** `npm run healthcheck` + `GET /api/v1/health`.
2. **حدد البيانات مقابل التطبيق:** هل الفشل في قاعدة البيانات أم في الخادم؟ راجع سجلات `npm start`.
3. **أوقف الكتابة إن لزم:** أوقف الخادم قبل أي استعادة.
4. **استعد من آخر نسخة تحقق منها:** `npm run restore -- --from ... --yes`.
5. **أعد التشغيل وتحقق:** `npm start` ثم `npm run healthcheck` ثم فحص `/data-quality`.
6. **سجّل الحادث:** الوقت، السبب، النسخة المستعادة، والأثر على المستخدمين.
7. **أبلغ:** إذا تأثرت بيانات مالية، أبلغ المستخدمين المعنيين وحدّث `/data-quality`.

**مؤشرات يجب مراقبتها:** `asOf` في `/api/v1/market/ticker`، عدد `NEEDS_REVIEW`، آخر `AuditRun`، وحجم `backups/`.

---

## 7. قائمة تحقق قبل الإطلاق / Pre-launch checklist

- [ ] `ADMIN_PASSCODE`, `CRON_SECRET`, `NEXT_PUBLIC_SITE_URL` معيّنة في بيئة النشر.
- [ ] `npm run backup` يعمل ويحتفظ بنسخة خارج الخادم.
- [ ] `npm run healthcheck` يعمل من خارج الخادم ويرسل تنبيهاً.
- [ ] تمرين استعادة ناجح موثّق.
- [ ] Sentry/APM مفعّل (موصى به).
- [ ] `NEXT_PUBLIC_SITE_URL` يطابق النطاق الفعلي (canonical/sitemap).
- [ ] `/data-quality` يعرض آخر `AuditRun` وعدد الـblockers = 0.
- [ ] لا أسرار في git أو في `reports/`.
