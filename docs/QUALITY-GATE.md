# Quality Gate — لازم كل feature جديد يعدي قبل الدمج

Checklist للمراجعة قبل ما أي feature/تعديل يوصله المستثمر. النسخة التشغيلية:
انسخ القسم ده في وصف الـ PR/التذكرة وعلّم على كل بند.

## Functionality
- [ ] الـ happy path شغال ومتحقق منه بالـ API أو البراوزر (مش "المفروض يشتغل")
- [ ] Loading state موجود (skeleton/spinner) ومميز عن الـ error
- [ ] Error state موجود + retry (ممنوع skeleton للأبد — `isError` من react-query)
- [ ] Empty state موجود وبيشرح ليه فاضي وإيه الخطوة الجاية
- [ ] كل query key بيشمل كل الـ parameters اللي بتغير النتيجة (basis / periodView / …)

## Correctness
- [ ] ممنوع خلط فترات غير قابلة للمقارنة (Q vs FY vs TTM) في نفس العرض
- [ ] ممنوع خلط CONSOLIDATED مع STANDALONE
- [ ] القيم المفقودة بتظهر "—" — مش صفر ومش تقدير
- [ ] أي رقم معروض له مصدر (reportId / sourceUrl) و reachable بـ click
- [ ] الأرقام بـ tabular-nums والسالب أحمر

## UX
- [ ] Responsive على 390px (جدول يعمل scroll أفقي، الكروت تتكدس)
- [ ] RTL سليم (ms-/me-/ps-/pe- — ممنوع left/right اليدوية)
- [ ] Keyboard: كل action reachable بـ Tab + Enter، والـ focus واضح
- [ ] الأيقونات الزخرفية `aria-hidden`، والأزرار ليها accessible name

## API & Data
- [ ] أي endpoint بيصرف موارد (LLM/تقارير) عليه rate limit أو admin gate
- [ ] مفيش PII أو مسارات ملفات (`localFileRef`) في الـ responses العامة
- [ ] القيم الجاية من مصدر خارجي موثقة بـ sourceName/sourceUrl
- [ ] سكريبتات البيانات idempotent (إعادة التشغيل آمنة)

## Code health
- [ ] `npx eslint <files>` نضيف
- [ ] `npx tsc --noEmit` مفيش أخطاء جديدة (أخطاء examples/ و.next الموروثة مقبولة)
- [ ] مفيش dead code/commented code اتضاف
- [ ] النصوص الجديدة双语 عبر i18n keys (مش strings عربي/إنجليزي inline في JSX الجديد)
- [ ] ملفات البيانات الـ audit (`scripts/audit-data-quality.cjs`) لسه PASS

## معروف بإنه مش متحقق منه آليًا
- Unit tests: مفيش test framework شغال حاليًا (backlog: vitest) — البديل الحالي
  سكريبتات الـ regression (`scripts/test-financial-intelligence-engine.ts`) والتحقق
  اليدوي الموثق.
