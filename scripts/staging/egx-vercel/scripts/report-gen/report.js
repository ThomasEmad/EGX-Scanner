// Main generator — تقرير تدقيق الجاهزية للإنتاج (Arabic RTL audit report)
const fs = require("fs")
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, AlignmentType, HeadingLevel, TableOfContents,
  PageBreak, PageNumber, NumberFormat, Header, Footer,
} = require("docx")
const { PAL, AR_FONT, ar, pAr, heading1, heading2, bullet, buildCoverR1RTL, allNoBorders, noBorders } = require("./helpers")

const OUT = "/home/z/my-project/download/تقرير-تدقيق-الجاهزية-للإنتاج-EGX.docx"

// -------------------------------------------------------------- table factory
function makeTable(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0)
  const T = PAL.table
  const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 }
  const headerRow = new TableRow({
    tableHeader: true, cantSplit: true,
    children: headers.map((h, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: T.headerBg },
      margins: cellMargins,
      width: { size: Math.round(colWidths[i] / total * 100), type: WidthType.PERCENTAGE },
      borders: noBorders,
      children: [pAr([ar(h, { size: 21, bold: true, color: T.headerText })], { align: AlignmentType.START, after: 0 })],
    })),
  })
  const bodyRows = rows.map((r, ri) => new TableRow({
    cantSplit: true,
    children: r.map((c, i) => new TableCell({
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? "FFFFFF" : T.surface },
      margins: cellMargins,
      width: { size: Math.round(colWidths[i] / total * 100), type: WidthType.PERCENTAGE },
      borders: { top: { style: BorderStyle.SINGLE, size: 2, color: T.innerLine }, bottom: { style: BorderStyle.SINGLE, size: 2, color: T.innerLine }, left: NB2(), right: NB2() },
      children: [pAr([ar(c, { size: 20 })], { align: AlignmentType.START, after: 0 })],
    })),
  }))
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: allNoBorders,
    rows: [headerRow, ...bodyRows],
  })
}
function NB2() { return { style: BorderStyle.NONE, size: 0, color: "FFFFFF" } }

// ------------------------------------------------------------------ content
const cover = buildCoverR1RTL({
  palette: PAL,
  englishLabel: "PRODUCTION READINESS AUDIT",
  title: "تقرير تدقيق الجاهزية للإنتاج",
  subtitle: "منصة EGX Scanner — تدقيق شامل للأمان وتجربة المستخدم وقابلية التوسع، مع خارطة طريق الوصول إلى 10,000 مستخدم",
  metaLines: [
    "نطاق التدقيق: الشيفرة الكاملة — 89 مسار API — 22 صفحة عامة — قاعدة البيانات — البنية التحتية",
    "المنهجية: ثلاثة تدقيقات متوازية (الأمان والحسابات / الميزات والتجربة / الإنتاج والتوسع)",
    "حالة المنصة: v0.3.0 — 297 شركة — 12,622 سعراً مسجلاً — 47,000 سجل تدقيق",
    "تاريخ التقرير: 6 نوفمبر 2026",
  ],
  footerRight: "EGX Financial Scanner",
  footerLeft: "وثيقة داخلية",
})

const body = []

// ===== 1. الملخص التنفيذي =====
body.push(heading1("1. الملخص التنفيذي"))
body.push(pAr("خضع موقع EGX Scanner ليلتين متتاليتين لأعمق عملية تدقيق منذ إنشائه: ثلاثة مسارات تدقيق متوازية غطت الأمان والحسابات، والميزات وتجربة المستخدم، والجاهزية للإنتاج وقابلية التوسع. النتيجة العامة إيجابية مع تحفظات: المنصة مبنية هندسياً بشكل ممتاز لعملة على خادم واحد (فصل صلاحيات، جلسات مُجزَّأة، نسخ احتياطي مُتحقق منه، طبقات تخزين مؤقت متدرجة)، لكن بعض البنيات المصممة لعملة واحدة تحتاج معالجة قبل استقبال عشرة آلاف مستخدم متزامن."))
body.push(pAr("أُصلحت خلال الجلسة الحالية 12 ملاحظة أمنية وتشغيلية جوهرية وتُحققت صحتها باختبارات شاملة (18/21 فحصاً من طرف إلى طرف بنجاح، و3 حالات كانت قصوراً في أداة الفحص لا في المنصة، و103/103 اختبارات وحدة ناجحة). وأبرز اكتشاف مهم: ميزة تسجيل الدخول عبر جوجل وفيسبوك موجودة ومكتملة في الشيفرة منذ البداية، لكنها مخفية عن المستخدمين لغياب مفاتيح التطبيقات لدى المالك — تفعيلها لا يستغرق أكثر من 20 دقيقة باتباع الدليل المرفق."))

// ===== 2. نطاق التدقيق =====
body.push(heading1("2. نطاق التدقيق والمنهجية"))
body.push(bullet("مسار الأمان: 9 مسارات مصادقة، نموذج المستخدم والجلسات، إعدادات الكوكيز، محددات المعدل، سجلات التدقيق، جاهزية OAuth."))
body.push(bullet("مسار التجربة: 22 صفحة عامة، 115 معالج API، مقارنة مع منصات عالمية مرجعية (Simply Wall St وstockanalysis وinvesting.com)."))
body.push(bullet("مسار الإنتاج: طبقة البيانات SQLite/Prisma، التخزين المؤقت، المهام الخلفية، النسخ الاحتياطي، النشر بـDocker، صفحات الالتزام القانوني."))

// ===== 3. النتائج =====
body.push(heading1("3. أبرز النتائج حسب المجال"))

body.push(heading2("3.1 الأمان والحسابات"))
body.push(makeTable(
  ["البيان", "الخطورة", "الحالة"],
  [
    ["كوكي جلسة المستخدم يُكتب من جافاسكربت دون HttpOnly أو Secure", "عالية", "أُصلحت — الخادم يضبطها الآن HttpOnly+Secure"],
    ["OAUTH_STATE_SECRET يسقط سراً ثابتاً مكتوباً في الشيفرة", "عالية", "أُصلحت — لا تسجيل اجتماعي دون سر حقيقي"],
    ["الوضع المؤقت للتحرير مفعل افتراضياً عند غياب المتغير", "عالية", "أُصلحت — الافتراض أصبح معطلاً"],
    ["عمليات تسجيل الدخول الفاشلة لا تُسجَّل في سجل التدقيق", "متوسطة", "أُصلحت — حدث LOGIN_FAILED يُسجل الآن"],
    ["validateEnv وcleanupExpiredSessions معرفتان ولا تُستدعيان أبداً", "متوسطة", "أُصلحت — استدعاء عند الإقلاع وتنظيف يومي"],
    ["غياب تغيير كلمة المرور وتحديث الملف الشخصي وحذف الحساب", "متوسطة", "أُضيف مسار change-password كاملاً"],
    ["auth/me بلا Cache-Control: no-store", "منخفضة", "أُصلحت"],
    ["رمز إعادة التعيين يُخزن نصاً صريحاً في سجل التدقيق", "متوسطة", "مؤجلة — هي قناة التسليم الوحيدة غياب البريد؛ تُحل مع ربط خدمة بريد"],
    ["لا قفل حسابات بعد محاولات فاشلة متكررة (تحديد معدل لكل IP فقط)", "متوسطة", "متبقية — توصية بالطبقة الثانية"],
    ["CSP يسمح بـunsafe-inline للسكربتات", "منخفضة", "متبقية — تتطلب إزالة الأنماط الداخلية تدريجياً"],
  ],
  [56, 14, 30]
))

body.push(heading2("3.2 تجربة المستخدم والميزات"))
body.push(pAr("المنصة تملك تغطية ميزات مُرضية جداً مقارنة بالمراجع العالمية: بحث شامل، مقارنة شركات، قائمة متابعة، محفظة، تنبيهات أسعار، وضع داكن، تطبيق ويب PWA، ثنائية اللغة، تصدير CSV، تقرير قابل للطباعة، وتحليل AI مؤسس على البيانات. أبرز الفجوات المرصودة:"))
body.push(makeTable(
  ["الفجوة", "الأثر على المستخدم", "الأولوية"],
  [
    ["التنبيهات لا تصل ببريد أو إشعار — استعلام داخل الصفحة فقط", "المستخدم يفقد قيمة التنبيهات الفعلية", "عالية"],
    ["البريد الإلكتروني غائب كلياً (استعادة كلمة المرور تتم يدوياً عبر الأدمن)", "احتكار تشغيلي على المالك", "عالية"],
    ["صفحة الشركات بلا زر متابعة/مقارنة على البطاقة نفسها", "نقرات إضافية مقابل المراجع العالمية", "متوسطة"],
    ["أزرار المشاركة الاجتماعية ومسار التنقل المرئي (breadcrumbs) غائبان", "انتشار أقل + تنقل أضعف", "منخفضة"],
    ["لا يوجد مركز إشعارات ولا ملخصات دورية بالبريد", "تفاعل أقل وعودة أقل", "متوسطة"],
  ],
  [44, 36, 20]
))

body.push(heading2("3.3 الجاهزية للإنتاج وقابلية التوسع"))
body.push(pAr("هذا هو المجال الحاسم لهدف 10,000 مستخدم متزامن. الخلاصة الصريحة: البنية الحالية (خادم واحد + SQLite) تخدم مئات المستخدمين المتزامنين بامتياز، لكنها سقف معماري لا يُكسر بإعدادات بل بترحيل مُخطط:"))
body.push(makeTable(
  ["المكوّن", "الوضع الحالي", "حد الأمان", "المطلوب للهدف"],
  [
    ["قاعدة البيانات", "SQLite ملف واحد مع WAL", "كاتب واحد فقط", "ترحيل إلى PostgreSQL (المخطط قابل للنقل، 5 مواقع SQL خام تحتاج تعديل boolean)"],
    ["حالة العمليات", "محمية بمتغيرات داخل العملية", "خادم واحد حكماً", "Redis للحد من المعدل والقفل الموزع عند تعدد الخوادم"],
    ["بث أسعار SSE", "قراءة ملف لكل نبضة لكل اتصال بحد 50", "مئات الاتصالات", "لقطة ثابتة + استقصاء 15 ثانية أو Redis pub/sub"],
    ["التخزين المؤقت", "داخل العملية مع SWR", "إبطال محلي فقط", "طبقة CDN أمام المسارات العامة (التهيئة موجودة)"],
    ["النسخ الاحتياطي", "يدوي على نفس القرص", "فقدان عند تلف القرص", "جدولة يومية + نسخة خارجية S3/خادم ثانٍ"],
  ],
  [20, 30, 20, 30]
))

// ===== 4. ما أُصلح =====
body.push(heading1("4. ما تم إصلاحه وتنفيذه هذه الليلة"))
body.push(pAr("نُفذت التغييرات التالية ودمجت في بناء الإنتاج الذي يعمل الآن، مع اجتياز فحص TypeScript الكامل و103 اختبارات وحدة واختبارات من طرف إلى طرف:"))
body.push(makeTable(
  ["الإصلاح", "الملفات"],
  [
    ["كوكي جلسة HttpOnly+Secure يضبطه الخادم عند الدخول/التسجيل/OAuth/تغيير كلمة المرور ويُلغى عند الخروج", "auth.ts، login، register، logout، auth/session جديد"],
    ["حدث LOGIN_FAILED مع IP عند كل دخول فاشل (يغذي شاشة الأحداث الأمنية للأدمن)", "login/route.ts"],
    ["مسار تغيير كلمة المرور كامل: تحقق من الحالية، رفض التكرار، إبطال الجلسات الأخرى، حد معدل 5/ساعة", "auth/change-password جديد"],
    ["إزالة السر الثابت من OAuth وربط التحقق عند الإقلاع مع تنظيف يومي للجلسات وتسجيل الانهيارات الصامتة", "oauth.ts، instrumentation.ts"],
    ["الافتراض الآمن لوضع التحرير المؤقت + تثبيت القيمة الحالية في .env", "temp-edit.ts، .env"],
    ["عناوين ووصف SEO لخمس صفحات كانت بلا metadata (دخول/تسجيل/استعادة/تنبيهات)", "خمسة layout.tsx جديدة"],
    ["توحيد تذييل الموقع على كل الصفحات (كان غائباً عن 12 صفحة تصفح)", "LayoutShell + 6 ملفات"],
    ["manifest بلغة عربية RTL + معرف ونطاق PWA صحيحان", "manifest.ts"],
    ["مسار auth/session لدفق الكوكي الآمن بعد دخول OAuth (الرمز عبر fragment فقط)", "auth/session جديد + auth/finish"],
    ["فحص صحة مُثرى: زمن استجابة القاعدة، الذاكرة، مدة التشغيل، الإصدار", "health/route.ts"],
    ["حارس تزامن لمهمة التدقيق المجدولة + تصحيح أوامر cron في الدليل + حذف vercel.json الميت + ترحيل تلقائي عند إقلاع Docker", "cron/audit، DEPLOY.md، docker-entrypoint.sh"],
    ["نسخ احتياطي يومي تلقائي للقاعدة (VACUUM INTO مع احتجاز 3 نسخ) ضمن سكربت البقاء الحي", "keep-alive.sh، backup-db.mjs"],
  ],
  [58, 42]
))

// ===== 5. OAuth =====
body.push(heading1("5. تسجيل الدخول بجوجل وفيسبوك — الجاهزية الكاملة"))
body.push(pAr("البنية موجودة ومكتملة ومكتوبة بمعايير آمنة: تدفق authorization-code من جانب الخادم، حالة موقعة HMAC بصلاحية 10 دقائق، ربط الحسابات فقط عبر بريد مُوثق من المزود، وتسليم الرمز عبر fragment لا يظهر في السجلات. الأزرار تظهر تلقائياً بمجرد إضافة المفاتيح إلى ملف .env:"))
body.push(bullet("GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET وFACEBOOK_CLIENT_ID وFACEBOOK_CLIENT_SECRET وOAUTH_STATE_SECRET وOAUTH_REDIRECT_BASE"))
body.push(pAr("الخطوات التفصيلية لإنشاء التطبيقات لدى جوجل وميتا مرفقة في مستند مستقل: دليل-تفعيل-تسجيل-الدخول-الاجتماعي.docx. لا يمكن تنفيذ هذه الخطوات نيابةً عن المالك لأنها تتطلب حسابه في Google Cloud وMeta for Developers."))

// ===== 6. خارطة الطريق =====
body.push(heading1("6. خارطة الطريق للوصول إلى 10,000 مستخدم"))
body.push(makeTable(
  ["المرحلة", "المهام", "المدة التقديرية", "الأثر"],
  [
    ["الآن — قبل الإطلاق", "تفعيل OAuth (20 دقيقة) + ربط خدمة بريد (Resend أو SMTP) لإعادة التعيين والتنبيهات + قفل الحسابات المتعبة", "يومان", "إغلاق كل البنود عالية الخطورة المتبقية"],
    ["أسبوع الإطلاق", "جدولة النسخ الخارجي + مراقبة uptime خارجية + صفحة إعدادات الحساب (تغيير كلمة المرور واجهةً) + تحسين صور OG للمشاركة", "أسبوع", "ثقة تشغيلية كاملة"],
    ["النمو — 1,000 مستخدم", "ترحيل SQLite إلى PostgreSQL (المخطط جاهز، يتطلب تعديل 5 مواقع SQL وتبديل DATABASE_URL)", "أسبوعان", "كسر سقف الكاتب الواحد"],
    ["التوسع — 10,000 مستخدم", "Redis للحد من المعدل والجلسات المشتركة + إبطال الكاش الموزع + استبدال SSE بلقطات واستقصاء + CDN أمام المسارات العامة + خادمان خلف موازن", "3-4 أسابيع", "توسع أفقي حقيقي"],
  ],
  [18, 44, 14, 24]
))

// ===== 7. المخاطر =====
body.push(heading1("7. المخاطر والقيود الحالية"))
body.push(bullet("بيئة الاستضافة الحالية (4GB ذاكرة) مناسبة للمعاينة والتطوير لكنها لا تصلح للإنتاج العام — يلزم خادم 2-4 أنوية و8GB ذاكرة أو نشر Docker على VPS."))
body.push(bullet("بيانات الأسعار تعتمد على تحديث يدوي من المالك حالياً؛ التشغيل الآلي عبر Yahoo Finance متاح بسكربت مجرب عند الطلب."))
body.push(bullet("جودة البيانات المالية تتوقف على مصادر الاستيراد (AskBorsa وTradingView) — محرك التدقيق يعمل ويكشف 1,974 ملاحظة حالية في آخر دورة."))
body.push(bullet("30 شركة تُتخطى في استيراد TradingView لغياب مطابقة رموزها — تحتاج خريطة رموز يدوية."))

// ===== 8. الخلاصة =====
body.push(heading1("8. الخلاصة والتوصيات"))
body.push(pAr("المنصة أقرب للجاهزية بكثير مما يُوحي بالانطباع الأول: البنية الآمنة الحساسة موجودة أصلاً، والفجوات التي ظهرت أُغلقت معظمها هذه الليلة، وما بقي مُوثق بخارطة طريق مرتبة بالأولوية والأثر. التوصية التنفيذية: نفّذ مرحلة «الآن» (OAuth + البريد + القفل) خلال يومين، وأطلق للمستخدمين الأوائل على خادم إنتاج مناسب مع PostgreSQL قبل أي حملة نمو — وبذلك تكون المنصة جاهزة فعلياً لاستقبال 10,000 مستخدم دون إعادة بناء."))
body.push(pAr([ar("ملحقات مرفقة: ", { bold: true }), ar("دليل تفعيل تسجيل الدخول الاجتماعي (docx) — نسخة الشيفرة الاحتياطية (code-backup) — سجل البقاء الحي (keep-alive.log)")]))

// ------------------------------------------------------------------ document
const doc = new Document({
  creator: "EGX Scanner",
  title: "تقرير تدقيق الجاهزية للإنتاج — EGX Scanner",
  styles: {
    default: {
      document: { run: { font: AR_FONT, size: 22 } },
    },
  },
  features: { updateFields: true },
  sections: [
    // Cover — margin 0, no page numbers
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: cover,
    },
    // TOC — roman numbering
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1200, right: 1200 }, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: AR_FONT })] })] }) },
      children: [
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.START,
          spacing: { before: 200, after: 240 },
          children: [ar("المحتويات", { size: 32, bold: true })],
        }),
        new TableOfContents("المحتويات", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.START, spacing: { before: 200 },
          children: [ar("ملاحظة: بعد فتح الملف اضغط بزر الفأرة الأيمن على المحتويات ثم «تحديث الحقل» لتحديث أرقام الصفحات.", { size: 18, italics: true, color: "888888" })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // Body — arabic numbering from 1
    {
      properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1200, right: 1200 }, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: {
        default: new Header({
          children: [new Paragraph({
            bidirectional: true, alignment: AlignmentType.START,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: PAL.accent, space: 4 } },
            children: [ar("تقرير تدقيق الجاهزية للإنتاج — EGX Scanner", { size: 16, color: "888888" })],
          })],
        }),
      },
      footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: AR_FONT, size: 18 })] })] }) },
      children: body,
    },
  ],
})

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf)
  console.log("written:", OUT, buf.length, "bytes")
})
