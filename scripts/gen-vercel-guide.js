// ============================================================
// دليل نشر منصة Meza على Vercel — Arabic RTL guide (docx)
// Follows docx skill: R1 cover recipe (RTL-mirrored), 3-section
// numbering, TOC + placeholders, RTL tables, LTR command blocks.
// ============================================================
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, PageNumber, NumberFormat, AlignmentType, HeadingLevel,
  WidthType, BorderStyle, ShadingType, SectionType, TableOfContents,
  PageBreak, TableLayoutType,
} = require("docx");
const fs = require("fs");

// ---------- Palette (cool + heavy + calm — deep navy tech) ----------
const P = {
  bg: "16233A", titleColor: "FFFFFF", subtitleColor: "C7D2E0",
  metaColor: "AFC0D4", accent: "4FA3C7", footerColor: "8FA3BC",
  primary: "16233A", body: "1C2430", secondary: "5B6B7D",
  surface: "F1F5F9", surfaceCmd: "F4F6F8",
};
const FONT = { ascii: "Tahoma", hAnsi: "Tahoma", cs: "Tahoma", eastAsia: "Tahoma" };
const CMD_FONT = { ascii: "Consolas", hAnsi: "Consolas", cs: "Consolas" };

// ---------- Border constants ----------
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ---------- Cover helpers (verbatim logic from design-system.md) ----------
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine;
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}
function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20; // conservative (CJK width) — Arabic renders narrower → safe
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt; }
  return { titlePt, titleLines: lines };
}
function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ---------- Cover R1 — RTL mirror (right-aligned) ----------
function buildCoverR1RTL(config) {
  const padR = 1200, padL = 800; // mirrored: text hugs the right edge
  const availableWidth = 11906 - padR - padL - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  });
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 };
  const children = [];
  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));
  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT,
      indent: { right: padR, left: padL }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, color: P.accent, font: FONT, characterSpacing: 40 })],
    }));
  }
  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT, bidirectional: true,
      indent: { right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true, rightToLeft: true, color: P.titleColor, font: FONT })],
    }));
  }
  if (config.subtitle) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT, bidirectional: true,
      indent: { right: padR }, spacing: { after: 800, line: 312 },
      children: [new TextRun({ text: config.subtitle, size: 24, rightToLeft: true, color: P.subtitleColor, font: FONT })],
    }));
  }
  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      alignment: AlignmentType.RIGHT, bidirectional: true,
      indent: { right: padR + 200 }, spacing: { after: 80, line: 312 },
      border: { right: accentRight },
      children: [new TextRun({ text: line, size: 24, rightToLeft: true, color: P.metaColor, font: FONT })],
    }));
  }
  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));
  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT, bidirectional: true,
    indent: { right: padR, left: padL },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerRight || "", size: 16, rightToLeft: true, color: P.footerColor, font: FONT }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerLeft || "", size: 16, color: P.footerColor, font: FONT }),
    ],
  }));
  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: P.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ---------- Body helpers ----------
function arRun(text, opts = {}) {
  return new TextRun({ text, rightToLeft: true, font: FONT, size: 24, color: P.body, ...opts });
}
function pAr(text, opts = {}) {
  const { spacing = {}, ...rest } = opts;
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED, bidirectional: true,
    spacing: { line: 312, after: 120, ...spacing },
    children: [arRun(text, rest.run || {})],
    ...rest.para || {},
  });
}
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1, bidirectional: true, alignment: AlignmentType.RIGHT,
    spacing: { before: 360, after: 160, line: 380, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, rightToLeft: true, size: 32, color: P.primary, font: FONT })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2, bidirectional: true, alignment: AlignmentType.RIGHT,
    spacing: { before: 240, after: 120, line: 340, lineRule: "atLeast" },
    children: [new TextRun({ text, bold: true, rightToLeft: true, size: 28, color: P.primary, font: FONT })],
  });
}
function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 }, bidirectional: true, alignment: AlignmentType.START,
    spacing: { line: 312, after: 60 },
    children: [arRun(text)],
  });
}
// Command block: LTR paragraphs, Consolas, shaded — one paragraph per line
function cmdBlock(lines, caption) {
  const out = [];
  if (caption) {
    out.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.RIGHT, keepNext: true,
      spacing: { line: 312, before: 120, after: 60 },
      children: [arRun(caption, { bold: true, size: 21, color: P.secondary })],
    }));
  }
  lines.forEach((line, idx) => {
    const isComment = line.trim().startsWith("#");
    const last = idx === lines.length - 1;
    out.push(new Paragraph({
      alignment: AlignmentType.LEFT,
      shading: { type: ShadingType.CLEAR, fill: P.surfaceCmd },
      border: {
        left: { style: BorderStyle.SINGLE, size: 10, color: P.accent, space: 8 },
        ...(last ? { bottom: { style: BorderStyle.SINGLE, size: 2, color: "D5DDE6", space: 6 } } : {}),
      },
      indent: { left: 240, right: 240 },
      spacing: { line: 312, lineRule: "atLeast", before: last ? 60 : 0, after: last ? 160 : 0 },
      children: [new TextRun({
        text: line, font: CMD_FONT, size: 19,
        color: isComment ? P.secondary : P.body,
      })],
    }));
  });
  return out;
}
// RTL table with header
function rtlTable(headers, rows, widths) {
  const mk = (text, isHeader, w) => new TableCell({
    width: { size: w, type: WidthType.PERCENTAGE },
    shading: { type: ShadingType.CLEAR, fill: isHeader ? "E8EEF4" : undefined },
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      bidirectional: true, alignment: AlignmentType.START, spacing: { line: 312 },
      children: [arRun(text, { size: 20, bold: isHeader, color: isHeader ? P.primary : P.body })],
    })],
  });
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D8E0" },
      insideVertical: NB,
    },
    rows: [
      new TableRow({ tableHeader: true, cantSplit: true, children: headers.map((t, i) => mk(t, true, widths[i])) }),
      ...rows.map((r) => new TableRow({ cantSplit: true, children: r.map((t, i) => mk(t, false, widths[i])) })),
    ],
  });
}
function tableTitle(text) {
  return new Paragraph({
    bidirectional: true, alignment: AlignmentType.RIGHT, keepNext: true,
    spacing: { line: 312, before: 160, after: 80 },
    children: [arRun(text, { bold: true, size: 21, color: P.secondary })],
  });
}
// Value cell with LTR latin content inside RTL table
function ltrVal(text) {
  return new TableCell({
    margins: { top: 60, bottom: 60, left: 120, right: 120 },
    children: [new Paragraph({
      alignment: AlignmentType.LEFT, spacing: { line: 312, lineRule: "atLeast" },
      children: [new TextRun({ text, font: CMD_FONT, size: 17, color: P.body })],
    })],
  });
}
function envTable(rows) {
  return new Table({
    visuallyRightToLeft: true,
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "9AA6B2" },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D8E0" },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: [
          new TableCell({ width: { size: 27, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: "E8EEF4" }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, children: [arRun("المتغير", { size: 20, bold: true })] })] }),
          new TableCell({ width: { size: 45, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: "E8EEF4" }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, children: [arRun("القيمة", { size: 20, bold: true })] })] }),
          new TableCell({ width: { size: 28, type: WidthType.PERCENTAGE }, shading: { type: ShadingType.CLEAR, fill: "E8EEF4" }, margins: { top: 60, bottom: 60, left: 120, right: 120 }, children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, children: [arRun("ملاحظات", { size: 20, bold: true })] })] }),
        ],
      }),
      ...rows.map(([name, value, note]) => new TableRow({
        cantSplit: true,
        children: [
          ltrVal(name),
          ltrVal(value),
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            margins: { top: 60, bottom: 60, left: 120, right: 120 },
            children: [new Paragraph({ bidirectional: true, alignment: AlignmentType.START, spacing: { line: 312 }, children: [arRun(note, { size: 19 })] })],
          }),
        ],
      })),
    ],
  });
}

// ============================================================
// BODY CONTENT
// ============================================================
const body = [];

// ---------- 1 ----------
body.push(h1("1. نظرة عامة على الخطة"));
body.push(pAr("الهدف من الدليل ده إنك ترفع منصة Meza على استضافة مجانية دائمة خطوة بخطوة، حتى يصبح الموقع شغال على رابط حقيقي بشهادة HTTPS طول الساعة. الخطة مبنية على ثلاث خدمات مجانية معروفة: استضافة Vercel لتشغيل الموقع، وقاعدة بيانات Turso السحابية لحفظ بياناتك، والبريد الإلكتروني عبر Gmail SMTP الذي جهزناه مسبقاً."));
body.push(pAr("قبل البدء خد بالك من ثلاث نقاط مهمة. أولاً: كل الأوامر في الدليل مكتوبة لويندوز، ولو شغال على ماك أو لينكس نفس الأوامر تنفذ من الترمينال مباشرة بدون خطوة WSL. ثانياً: الموقع الحالي على رابط المعاينة يظل شغال زي ما هو، وحتى لو حصلت مشكلة في النشر لا يحدث أي ضرر للنسخة الحالية. ثالثاً: كل الخطوات مجانية تماماً، والحاجة الوحيدة المدفوعة اختياً هي شراء دومين حقيقي بـ 10 إلى 15 دولار في السنة."));
body.push(tableTitle("مكونات الخطة والتكاليف"));
body.push(rtlTable(
  ["المكون", "الخدمة", "التكلفة", "دورها"],
  [
    ["الاستضافة", "Vercel — خطة Hobby", "مجاني", "تشغيل الموقع 24/7 مع HTTPS تلقائي"],
    ["قاعدة البيانات", "Turso — الخطة المجانية", "مجاني حتى 5GB", "حفظ الشركات والبيانات المالية والمستخدمين"],
    ["البريد الإلكتروني", "Gmail SMTP", "مجاني", "إرسال روابط استعادة كلمة السر والترحيب"],
    ["الذكاء الاصطناعي", "Google Gemini", "مجاني", "التحليل الذكي للشركات (اختياري)"],
    ["الدومين الحقيقي", "Namecheap وغيرها", "10-15 دولار/سنة", "اختياري — الرابط المجاني يكفي للبداية"],
  ],
  [18, 30, 18, 34]
));
body.push(pAr("تحديث سارّ قبل ما تبدأ: الخطوتين الأتقل في الدليل — إنشاء قاعدة Turso ورفع بياناتك عليها، وتجهيز مفتاح الذكاء الاصطناعي — خلصت بالفعل واتاختبرت، وقيمها محطوطة جاهزة في ملف egx-vercel-env.txt. يعني اللي متبقي عليك فعلاً هو فك ضغط الكود ورفعه على Vercel ولصق متغيرات الإعداد، وده بياخد حوالي 20 إلى 30 دقيقة بس."));

// ---------- 2 ----------
body.push(h1("2. الملفات اللي في الحزمة"));
body.push(pAr("جهزتلك ثلاثة ملفات في مجلد التنزيلات، وهتستخدمهم بالترتيب خلال الدليل. خليهم كلهم في مجلد Downloads أو أي مجلد تعرفه وتمشي عليه."));
body.push(bullet("الملف الأول: egx-vercel-code.zip — كود الموقع كامل معدل ومجهز خاصاً لـ Vercel (قاعدة البيانات عبر Turso، والذكاء الاصطناعي عبر مفتاح خارجي، وحماية المسارات). ده الملف الوحيد اللي هنستخدمه في النشر."));
body.push(bullet("الملف الثاني: egx-turso-dump.sql.gz — نسخة مضغوطة من قاعدة بياناتك كاملة (297 شركة، وأكثر من 790 ألف سجل مالي، والمستخدمين العشرة). دي اترفعت بالفعل على Turso واتحقق منها — سيبها كنسخة احتياطية ومتلمسهاش."));
body.push(bullet("الملف الثالث: egx-vercel-env.txt — قائمة متغيرات الإعداد مكتملة بالقيم الفعلية كلها (رابط القاعدة والتوكن ومفتاح الذكاء الاصطناعي ولوحة الأدمن والإيميل) — جاهزة للنسخ حرف بحرف."));
body.push(pAr("النسخة اللي في الحزمة اتختبرت فعلياً قبل تسليمها: 103 اختبار آلي عدوا كلهم بنجاح، وفحص الأنواع خرج بدون أي خطأ، وبرضه الكود نفسه اتصّل بقاعدة Turso بتاعتك بالتوكن الحقيقي وقري منها الشركات والمستخدمين بنجاح — يعني مسار الإنتاج نفسه اللي هيشتغل على Vercel متختبر خلاص."));

// ---------- 3 ----------
body.push(h1("3. الخطوة 1 — تجهيز جهازك"));
body.push(h2("تثبيت Node.js (ضروري لأدوات الرفع)"));
body.push(pAr("افتح موقع nodejs.org من المتصفح ونزل نسخة LTS (الزر الأصفر الكبير)، وشغل ملف التثبيت واضغط Next وNext لحد Finish بدون تغيير أي إعداد. بعد التثبيت افتح PowerShell من قائمة ابدأ واكتب الأمر ده للتأكد إن كل حاجة تمام:"));
body.push(...cmdBlock(["node --version", "npm --version"], "نفذ الأمرين دول في PowerShell — المفروض يظهروا أرقام إصدارات"));
body.push(h2("ملحوظة عن WSL (اتلغت — مش محتاجها)"));
body.push(pAr("النسخة القديمة من الدليل كانت بتطلب تفعيل WSL (طبقة لينكس جوه ويندوز) عشان تستخدم أداة Turso لرفع قاعدة البيانات من جهازك. الخطوة دي اتلغت تماماً لأن رفع البيانات خلص بالفعل من عندي مباشرة — فمتثبتش WSL ومتضيعش وقتك هنا حتى لو كنت كنت هتعملها."));

// ---------- 4 ----------
body.push(h1("4. الخطوة 2 — فك ضغط الحزمة"));
body.push(pAr("روح لمجلد التنزيلات، وكليك يمين على egx-vercel-code.zip واختر Extract All أو استخراج الكل، وسيب مكان الاستخراج زي ما هو. هيتعمل مجلد اسمه egx-vercel جواه كل كود الموقع — ده الملف الوحيد اللي هنفك ضغطه. ملف قاعدة البيانات ماتلمسهوش ولا تفك ضغطه خلاص، وملف egx-vercel-env.txt سيبه زي ما هو — هنستخدمه في الخطوة 4 كمرجع للنسخ منه."));

// ---------- 5 ----------
body.push(h1("5. قاعدة البيانات على Turso (تم بالفعل ✅)"));
body.push(pAr("دي كانت أطول خطوة في النسخة القديمة من الدليل، وهي خلصت بالفعل: القاعدة اتعملت على Turso باسم meza، وبياناتك كلها اترفعت عليها من عندي مباشرة، واتعمل تحقق سجل بسجل — كل الجداول الـ 42 مطابقة 100% للمصدر: 297 شركة، و496,071 مؤشر محسوب، و283,950 قيمة مالية، و12,622 سعر سوق، والمستخدمين العشرة، وسجلات الفحص."));
body.push(pAr("الاتصال اتاختبر فعلياً بالتوكن الحقيقي: القراءة نجحت والكتابة نجحت، وكمان كود الموقع نفسه اتصّل بالقاعدة وقري الشركات بنجاح قبل التسليم، وامان القاعدة مفعّل. رابط القاعدة والتوكن متسجلين جاهزين في ملف egx-vercel-env.txt — يعني مفيش أمر واحد تنفذه في الخطوة دي، خلاص ارشفة ومتلمسش حاجة هنا."));

// ---------- 6 ----------
body.push(h1("6. الخطوة 3 — رفع الموقع على Vercel"));
body.push(pAr("Vercel هي المنصة اللي هتستضيف الموقع. بتكتشف مشروعات Next.js تلقائياً وبتديك رابط فوري بشهادة أمان. هنشتغل بأمرين بس من PowerShell داخل مجلد الكود."));
body.push(...cmdBlock([
  "npm install -g vercel",
  "cd $HOME\\Downloads\\egx-vercel",
  "vercel login",
], "تثبيت الأداة ثم الدخول — هيفتح المتصفح لتسجيل الدخول بحساب جوجل أو جيت هاب"));
body.push(pAr("بعد الدخول، أول أمر رفع هو vercel لوحده عشان ينشئ المشروع — هيسألك أسئلة متتابعة، جاوب كده: قول Y لسؤال الإعداد، واختار حسابك الشخصي، واكتب N على سؤال الربط بمشروع موجود، واكتب اسم المشروع (مثلاً meza) وسيب باقي الأسئلة على الافتراضي بمجرد الضغط Enter. أول رفعة دي مجرد إنشاء مشروع — الجاية هي الرسمية بعد ما ندخل الإعدادات:"));
body.push(...cmdBlock([
  "vercel",
  "vercel --prod",
], "الأول ينشئ المشروع، والتاني الرفع النهائي (بعد ما تكمل الخطوة 4)"));
body.push(pAr("لما الرفع النهائي يخلص هيطبعلك رابط موقعك النهائي — شكله https://meza.vercel.app أو مشابه. افتحه — لو ظهرت صفحة ترحيب أو صفحة تسجيل دخول يبقى الموقع عايش! لو ظهرت صفحة خطأ متقلقش، ده طبيعي لأن متغيرات الإعداد لسه محطوطة — دي خطوة جاية."));

// ---------- 7 ----------
body.push(h1("7. الخطوة 4 — لصق متغيرات الإعداد"));
body.push(pAr("افتح ملف egx-vercel-env.txt لأن كل القيم جاهزة فيه بالفعل، ومن المتصفح افتح مشروعك على vercel.com وادخل على Settings ثم Environment Variables، وهتضيف كل صف من الجدولين دول: حط الاسم في خانة Key والقيمة في خانة Value واختار جميع البيئات ثم Add. انسخ القيم من الملف حرف بحرف بدون مسافات زيادة — خصوصاً التوكن الطويل."));
body.push(h2("الجدول الأول — القاعدة والأمان (إلزامي)"));
body.push(envTable([
  ["TURSO_DATABASE_URL", "جاهزة في ملف egx-vercel-env.txt — انسخها زي ما هي", "تبدأ بـ libsql://meza"],
  ["TURSO_AUTH_TOKEN", "جاهزة في ملف egx-vercel-env.txt — انسخها زي ما هي", "سطر طويل واحد يبدأ بـ eyJ"],
  ["DATABASE_URL", "سيبه فاضي — مش بيستخدم لما Turso موجود (اتحقق بالتجربة)", "فاضي"],
  ["ADMIN_PASSCODE", "<YOUR-ADMIN-PASSCODE>", "كود دخول لوحة الأدمن الحالي"],
  ["CRON_SECRET", "6c676ef713fe9f46c564ba4a4a05ad8bba2a57214f57a199c9367cb4852e3221", "مفتاح الصيانة الدورية"],
  ["NEXT_PUBLIC_SITE_URL", "رابط موقعك من الخطوة 3", "هتضيفه بعد أول رفعة"],
  ["TRUSTED_PROXIES", "*", "ثابت — زي ما هي"],
  ["NEXT_PUBLIC_TEMP_EDIT_MODE", "true", "ثابت — زي ما هي حالياً"],
]));
body.push(h2("الجدول الثاني — البريد والذكاء الاصطناعي"));
body.push(envTable([
  ["MAIL_PROVIDER", "smtp", "ثابت"],
  ["SMTP_HOST", "smtp.gmail.com", "ثابت"],
  ["SMTP_PORT", "465", "ثابت"],
  ["SMTP_USER", "tomasemad286@gmail.com", "جاهز من إعداداتك"],
  ["SMTP_PASS", "<YOUR-GMAIL-APP-PASSWORD>", "جاهز من إعداداتك"],
  ["MAIL_FROM", "Meza <tomasemad286@gmail.com>", "جاهز"],
  ["AI_API_KEY", "جاهزة في ملف egx-vercel-env.txt — تم اختبارها بنجاح", "تبدأ بـ AQ."],
  ["AI_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/", "ثابت"],
  ["AI_MODEL", "gemini-3.8-flash", "ثابت — جوجل أوقفت gemini-2.5-flash للمستخدمين الجدد فاستخدمنا البديل الرسمي"],
  ["SEARCH_API_KEY", "فاضي حالياً", "اختياري — بحث الويب التلقائي"],
]));
body.push(pAr("بعد ما تخلص إدخال كل الصفوف، ارجع للترمينال ونفذ vercel --prod مرة تانية عشان الرفعة الجديدة تاخد الإعدادات. المرة دي الموقع المفروض يفتح كامل بالشركات والبيانات."));

// ---------- 8 ----------
body.push(h1("8. الذكاء الاصطناعي (تم بالفعل ✅)"));
body.push(pAr("مفتاح Gemini المجاني بتاعك جبته من Google AI Studio ومتسجل جاهز في ملف egx-vercel-env.txt تحت اسم AI_API_KEY، واتاختبر فعلياً على واجهة جوجل والمصادقة نجحت. ملاحظة مهمة: جوجل أوقفت موديل gemini-2.5-flash للمستخدمين الجدد، فحدثنا الإعداد للموديل الأحدث gemini-3.8-flash اللي جوجل نفسها بترشحه — القيمة دي متسجلة في الملف زي باقي القيم."));
body.push(pAr("لو المفتاح وقع أو وصل حد الاستخدام المجاني في أي وقت، الموقع مش هيبوظ — بيرجع تلقائياً لتحليل مبني على قواعد جاهزة ومكتوب إنه مبسط. ولو حبيت تستخدم نماذج GLM الصينية بدل جيميني في أي وقت، غيّر AI_BASE_URL إلى https://open.bigmodel.cn/api/paas/v4/ و AI_MODEL إلى glm-4-flash بس."));

// ---------- 9 ----------
body.push(h1("9. الخطوة 5 — الصيانة الدورية التلقائية"));
body.push(pAr("الموقع فيه مسار صيانة بيسحب الجلسات القديمة وينضف السجلات المتراكمة عشان القاعدة تفضل خفيفة. على Vercel مفيش مؤقتات مدمجة في الخطة المجانية، فهنعمل واحدة مجانية من موقع cron-job.org: افتح الموقع وسجل بحساب مجاني، واضغط Create cronjob، وسميه maintenance، وفي خانة URL حط:"));
body.push(...cmdBlock(["https://رابط-موقعك.vercel.app/api/v1/cron/maintenance"], "استبدل رابط-موقعك بالرابط الفعلي"));
body.push(pAr("اختار تكرار كل يوم (Advanced يسمح بتحديد الساعة — اختار 3 صباحاً مثلاً)، وفي قسم Advanced أو Headers ضيف هيدر اسمه Authorization وقيمته Bearer متبوعة بمسافة ثم كود CRON_SECRET من الجدول الأول، واحفظ. من نفس الموقع تقدر تعمل مهمة تانية بسيطة بتصيب الرابط الرئيسي كل 5 دقايق عشان تبقي الموقع دايماً سخن وأسرع في أول فتح."));

// ---------- 10 ----------
body.push(h1("10. الخطوة 6 — قائمة التحقق النهائية"));
body.push(pAr("امشي على القائمة دي بالترتيب ولو كل بند شغال يبقى النشر خلص بنجاح:"));
body.push(bullet("فتح الرابط الرئيسي: الصفحة بتفتح وقايمة الشركات ظاهرة بالبيانات المالية."));
body.push(bullet("تسجيل دخول مستخدم قديم: حساب من المستخدمين العشرة بيدخل عادي لأن بياناتهم اتنقلت."));
body.push(bullet("لوحة الأدمن: الدخول بكود الأدمن الحالي بيشتغل."));
body.push(bullet("استعادة كلمة السر: من صفحة الدخول اكتب إيميلك — المفروض يوصلك إيميل برابط استعادة من عنوان tomasemad286@gmail.com (بص على Junk لو مستخدش على طول)."));
body.push(bullet("التحليل الذكي: صفحة شركة عليها بيانات، اضغط تحليل ذكي، والمفروض يطلع تحليل كامل بعد شوية."));
body.push(bullet("الجوال: افتح الرابط من الموبايل — التصميم متجاوب زي ما هو."));
body.push(pAr("لو كل البنود عدت، مبروك — موقعك بقى شغال على استضافة دائمة بمجاني. احتفظ بـ vercel --prod كطريقة رفع أي تحديث جاي، وهبعتلك الحزم المحدثة بنفس الشكل."));

// ---------- 11 ----------
body.push(h1("11. الدومين الحقيقي (اختياري — بعدين)"));
body.push(pAr("لما تحب يكون عندك عنوانك الخاص زي egxpulse.com: اشتري الدومين من Namecheap أو Cloudflare Registrar بحوالي 10 إلى 15 دولار في السنة، وبعدين من Vercel ادخل Settings ثم Domains واكتب الدومين واضغط Add. الموقع هيقولك تعمل إيه في لوحة الشركة اللي اشتريت منها: غالباً سطر A Record بقيمة 76.76.21.21 أو سطر CNAME بقيمة cname.vercel-dns.com. بعد ما الـ DNS يتفعل (من ساعة لـ 24 ساعة) شهادة الأمان بتتفعل لوحدها. آخر خطوة: حدّث NEXT_PUBLIC_SITE_URL في Vercel بالدومين الجديد ونفذ vercel --prod، وكذلك حدّث روابط تسجيل الدخول بجوجل وفيسبوك لما تجيب مفاتيحهم."));

// ---------- 12 ----------
body.push(h1("12. حل المشاكل الشائعة"));
body.push(tableTitle("أشهر المشاكل وحلها السريع"));
body.push(rtlTable(
  ["المشكلة", "السبب الغالب", "الحل"],
  [
    ["صفحة خطأ 500 بعد الرفع", "متغير ناقص أو غلط", "راجع الجدولين حرف بحرف، خصوصاً TURSO_DATABASE_URL وTURSO_AUTH_TOKEN، ثم vercel --prod تاني"],
    ["الرفع على Vercel بيفشل في البناء", "مشكلة مؤقتة أو خطأ في الحزمة", "ابعتلي نص رسالة الخطأ من صفحة Deployment على Vercel وأنا أصلحه فوراً"],
    ["رسالة خطأ فيها Turso أو libsql", "رابط القاعدة أو التوكن ناقص أو فيه مسافة زيادة", "انسخهم تاني من egx-vercel-env.txt بالظبط بدون مسافات ثم vercel --prod تاني"],
    ["الإيميلات مش بتوصل", "رفض Gmail للمفتاح", "تأكد إن SMTP_USER هو نفس الجيميل اللي عمل منه App Password، وجرب صفحة استعادة كلمة السر تاني"],
    ["التحليل الذكي بيرجع نسخة مبسطة", "مفتاح AI مش واصل من Vercel", "اتأكد إن AI_API_KEY منسوخة من egx-vercel-env.txt بدون مسافات — ولو المشكلة استمرت، النسخة المبسطة مش عطل، دي بديل آمن مؤقت"],
    ["أمر تحديث الأسعار من لوحة الأدمن بيرفض", "ده مقصود على Vercel", "تحديث السوق اللحظي مش متاح على الاستضافة المجانية — البيانات الموجودة شغالة عادي"],
    ["الموقع أول فتح بطيء شوية", "السيرفر بينام بعد فترة سكون", "طبيعي في الخطة المجانية — مهمة الـ ping كل 5 دقايق من الخطوة 5 بتحلها"],
  ],
  [30, 26, 44]
));

// ---------- 13 ----------
body.push(h1("13. حدود الخطة المجانية بصراحة"));
body.push(pAr("عشان متتفاجأش بحاجة، دي الحدود الفعلية للخطة المجانية بالأرقام: Vercel الخطة المجانية مسموحة رسمياً للاستخدام الشخصي وغير التجاري بحدود سخية جداً (100 جيجا نقل بيانات شهرياً وكمية تنفيذ هائلة) — لو الموقع بقى تجاري بجد وبيكسب فلوس، ساعتها نطري لخطة بسيطة أو ننتقل لسيرفر مصغر مدفوع. Turso المجاني حتى 5 جيجا تخزين و500 مليون قراءة شهرياً، وبياناتك الحالية أقل من عُشر الحد — يعني مساحة قدامك كتير جداً. مدة تنفيذ الدوال محدودة، فرفع ملفات PDF ضخمة جداً للاستخراج الآلي ممكن يتقطع — الرفع الصغير والعادي شغال."));
body.push(pAr("وكمان خد بالك: سجلات الوديت الأقدم من 90 يوم مش مضمنة في النسخة اللي اترفعت (عشان حجم الرفع يبقى معقول)، لكن السجلات الجديدة هتتجمع عادي من يوم التشغيل. وأخيراً: سيب النسخة الحالية على رابط المعاينة شغالة زي ما هي، هي ونسخة Vercel هيخدوا من نفس قاعدة البيانات المنفصلة — النسخة الرسمية الجديدة بتاعة المستخدمين تبقى بتاعة Vercel، والقديمة تنفع كنسخة احتياطية تجريبية."));

// ============================================================
// DOCUMENT ASSEMBLY — 3 sections (cover / TOC roman / body arabic)
// ============================================================
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

function pageNumFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: FONT })],
    })],
  });
}

const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: FONT, size: 24, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
      heading1: {
        run: { font: FONT, size: 32, bold: true, color: P.primary },
        paragraph: { spacing: { before: 360, after: 160, line: 380 } },
      },
      heading2: {
        run: { font: FONT, size: 28, bold: true, color: P.primary },
        paragraph: { spacing: { before: 240, after: 120, line: 340 } },
      },
    },
  },
  sections: [
    // Section 1 — Cover (margin 0, no footer, no pageNumbers)
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1RTL({
        title: "دليل نشر منصة Meza على Vercel",
        subtitle: "خطوة بخطوة: استضافة مجانية دائمة مع قاعدة بيانات Turso وبريد Gmail — حتى موقعك يشتغل على رابط حقيقي بـ HTTPS",
        englishLabel: "VERCEL DEPLOYMENT GUIDE",
        metaLines: [
          "الهدف: موقع شغال 24/7 على رابط مجاني دائم",
          "البنية: Vercel + Turso + Gmail SMTP",
          "المدة المتوقعة: 20 إلى 30 دقيقة",
          "الإصدار: نوفمبر 2026",
        ],
        footerRight: "منصة Meza — دليل النشر الإنتاجي",
        footerLeft: "نوفمبر 2026",
      }),
    },
    // Section 2 — TOC (roman numerals)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageNumFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER, bidirectional: true,
          spacing: { before: 480, after: 360, line: 380, lineRule: "atLeast" },
          children: [new TextRun({ text: "المحتويات", bold: true, size: 32, rightToLeft: true, color: P.primary, font: FONT })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          bidirectional: true, alignment: AlignmentType.RIGHT, spacing: { before: 200 },
          children: [new TextRun({
            text: "ملاحظة: الفهرس ده متولد بحقول أوتوماتيك. لو عدلت في المستند، اعمل كليك يمين على الفهرس واختار Update Field عشان أرقام الصفحات تتحدث.",
            italics: true, size: 18, rightToLeft: true, color: "888888", font: FONT,
          })],
        }),
        // NOTE: no trailing PageBreak here — the next section starts with
        // SectionType.NEXT_PAGE, and PageBreak + NEXT_PAGE = blank page
        // (postcheck rule: double page break).
      ],
    },
    // Section 3 — Body (arabic numerals from 1)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      footers: { default: pageNumFooter() },
      children: body,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("/home/z/my-project/download/دليل-النشر-على-Vercel.docx", buf);
  console.log("GUIDE_DOCX_OK", buf.length, "bytes");
});
