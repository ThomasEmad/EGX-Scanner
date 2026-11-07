// OAuth activation guide (Arabic RTL) — short doc, no cover (per skill rules)
const fs = require("fs")
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  BorderStyle, ShadingType, AlignmentType, Header, Footer, PageNumber, NumberFormat,
} = require("docx")
const { PAL, AR_FONT, ar, pAr, heading1, heading2, bullet } = require("./helpers")

const OUT = "/home/z/my-project/download/دليل-تفعيل-تسجيل-الدخول-الاجتماعي.docx"
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }

function step(n, items) {
  // items: first entry = bold step title, the rest = sub-lines
  const [title, ...rest] = items
  const out = [pAr([ar(`${n}. `, { bold: true, color: PAL.accent }), ar(title, { bold: true })], { align: AlignmentType.START, after: 60 })]
  for (const l of rest) out.push(pAr([ar(l)], { align: AlignmentType.START, after: 60, indent: { right: 350 } }))
  return out
}

function code(lines) {
  return lines.map((l) => new Paragraph({
    alignment: AlignmentType.START,
    spacing: { line: 276, after: 20 },
    indent: { right: 500, left: 500 },
    shading: { type: ShadingType.CLEAR, fill: "F5F2E8" },
    children: [new TextRun({ text: l, font: { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas" }, size: 19, sizeComplexScript: 19, color: "5A4A1A" })],
  }))
}

const body = []
body.push(new Paragraph({
  bidirectional: true, alignment: AlignmentType.START, spacing: { after: 100 },
  children: [ar("دليل تفعيل تسجيل الدخول الاجتماعي (جوجل وفيسبوك)", { size: 34, bold: true, color: "1A1A1A" })],
}))
body.push(pAr([ar("منصة Meza — 6 نوفمبر 2026. الزمن المطلوب: 20-30 دقيقة. لا تحتاج أي تعديل في الشيفرة إطلاقاً — كل ما تحتاجه مفاتيح تطبيقات تُنشئها بنفسك ثم تضيفها إلى ملف .env.", { size: 20, color: "666666" })], { after: 240 }))

body.push(heading1("أولاً: جوجل (Google)"))
body.push(...step(1, ["افتح Google Cloud Console (console.cloud.google.com) وأنشئ مشروعاً جديداً باسم Meza."]))
body.push(...step(2, ["من القائمة: APIs & Services ← OAuth consent screen. اختر External، املأ اسم التطبيق وبريد الدعم، واحفظ. أضف النطاق meza-ashy.vercel.app (أو نطاقك) في Authorized domains."]))
body.push(...step(3, ["من: Credentials ← Create Credentials ← OAuth client ID. النوع: Web application."]))
body.push(...step(4, ["في Authorized redirect URIs أضف العنوانين التاليين (استبدل النطاق بنطاقك الفعلي):"]))
body.push(...code([
  "https://YOUR-DOMAIN.com/api/v1/auth/oauth/google/callback",
  "http://localhost:3000/api/v1/auth/oauth/google/callback",
]))
body.push(...step(5, ["انسخ Client ID وClient Secret — ستحتاجهما في الخطوة الثالثة أدناه."]))

body.push(heading1("ثانياً: فيسبوك (Meta)"))
body.push(...step(1, ["افتح developers.facebook.com وأنشئ تطبيقاً جديداً من نوع Consumer."]))
body.push(...step(2, ["أضف منتج Facebook Login من لوحة التطبيق."]))
body.push(...step(3, ["من: Facebook Login ← Settings أضف Valid OAuth Redirect URIs بنفس العنوانين السابقين مع استبدال google بـ facebook:"]))
body.push(...code([
  "https://YOUR-DOMAIN.com/api/v1/auth/oauth/facebook/callback",
  "http://localhost:3000/api/v1/auth/oauth/facebook/callback",
]))
body.push(...step(4, ["من: Settings ← Basic انسخ App ID وApp Secret (اضغط Show ثم أدخل كلمة مرورك)."]))

body.push(heading1("ثالثاً: إضافة المفاتيح إلى الخادم"))
body.push(pAr("أضف الأسطر التالية إلى ملف .env في جذر المشروع (القيم من الخطوتين السابقتين):"))
body.push(...code([
  "GOOGLE_CLIENT_ID=xxxxxxxx.apps.googleusercontent.com",
  "GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxx",
  "FACEBOOK_CLIENT_ID=xxxxxxxxxxxxxxxx",
  "FACEBOOK_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxx",
  "OAUTH_STATE_SECRET=<سلسلة عشوائية طويلة — أنشئها بأمر openssl rand -hex 32>",
  "OAUTH_REDIRECT_BASE=https://YOUR-DOMAIN.com",
]))
body.push(pAr("ثم أعد تشغيل الخادم. ستظهر أزرار «المتابعة مع جوجل» و«المتابعة مع فيسبوك» تلقائياً في صفحتي تسجيل الدخول وإنشاء الحساب لكل الزوار — بلا أي خطوة إضافية.", { before: 120 }))

body.push(heading1("رابعاً: كيف يعمل النظام (ملخص تقني)"))
body.push(bullet("التدفق: authorization-code كامل من جانب الخادم — لا تمر أي مفاتيح عبر المتصفح."))
body.push(bullet("الحماية من CSRF: حالة موقعة HMAC-SHA256 بصلاحية 10 دقائق تُخزن في كوكي HttpOnly وتُتحقق عند العودة."))
body.push(bullet("ربط الحسابات: إذا سجلت بجوجل بنفس البريد المسجل محلياً وبريدك مُوثق لدى جوجل، يُربط الحسابان تلقائياً بنفس الحساب — وإلا يُنشأ حساب جديد."))
body.push(bullet("تسليم الجلسة: الرمز يعود عبر fragment الخاص بالرابط (لا يظهر في سجلات الخادم ولا في التحليلات)، ثم تضبط صفحة الإكمال كوكي الجلسة HttpOnly."))
body.push(bullet("حسابات جوجل بلا كلمة مرور محلية: لا يمكن الدخول بالبريد وكلمة مرور إلا بعد تعيين كلمة مرور من صفحة استعادة الحساب — مسار change-password الجديد يتيح تعيينها دون معرفة السابقة."))

body.push(heading1("خامساً: التحقق بعد التفعيل"))
body.push(bullet("افتح /login وتأكد من ظهور الزرين."))
body.push(bullet("جرّب الدخول بجوجل ثم تأكد أن /watchlist تعمل وأن كوكي الجلسة (F12 ← Application ← Cookies) يظهر بعلامة HttpOnly."))
body.push(bullet("من لوحة الأدمن ← مراجعة الأحداث: يظهر حدث OAUTH_LOGIN أو OAUTH_SIGNUP لكل دخول اجتماعي."))

body.push(pAr([ar("ملاحظة أمنية: ", { bold: true }), ar("لا تشارك المفاتيح مع أي طرف، ولا ترفعها إلى مستودع عام. ملف .env مستثنى من النسخة الاحتياطية العامة للشيفرة.")], { before: 160 }))

const doc = new Document({
  creator: "Meza",
  title: "دليل تفعيل تسجيل الدخول الاجتماعي",
  styles: { default: { document: { run: { font: AR_FONT, size: 22 } } } },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1300, bottom: 1300, left: 1200, right: 1200 }, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
    headers: { default: new Header({ children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: PAL.accent, space: 4 } }, children: [ar("دليل تفعيل تسجيل الدخول الاجتماعي — Meza", { size: 16, color: "888888" })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], font: AR_FONT, size: 18 })] })] }) },
    children: body,
  }],
})

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf)
  console.log("written:", OUT, buf.length, "bytes")
})
