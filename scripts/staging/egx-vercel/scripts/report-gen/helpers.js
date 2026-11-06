// RTL helpers + adapted Cover Recipe R1 (Ink Gold) for the Arabic audit report.
// Follows the docx skill design-system: single 16838 wrapper table, paragraph
// borders only, calcTitleLayout + calcCoverSpacing.
const {
  Paragraph, TextRun, Table, TableRow, TableCell, WidthType, TableLayoutType,
  BorderStyle, ShadingType, AlignmentType,
} = require("docx")

// ---------------------------------------------------------------- palette
const PAL = {
  bg: "1A1A1A", primary: "FFFFFF", accent: "C9A84C",
  cover: { titleColor: "FFFFFF", subtitleColor: "B0B8C0", metaColor: "90989F", footerColor: "687078" },
  table: { headerBg: "C9A84C", headerText: "1A1A1A", accentLine: "C9A84C", innerLine: "DDD5C0", surface: "F5F2E8" },
}

const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" }
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB }
const noBorders = { top: NB, bottom: NB, left: NB, right: NB }

const AR_FONT = { ascii: "Arial", hAnsi: "Arial", cs: "Arial" }

// ------------------------------------------------------------ text factories
/** Arabic body run — rtl + complex-script size mirrored. */
function ar(text, opts = {}) {
  const size = opts.size ?? 22
  return new TextRun({
    text, rightToLeft: true, font: AR_FONT,
    size, sizeComplexScript: size, bold: opts.bold ?? false,
    color: opts.color, italics: opts.italics,
  })
}

/** RTL paragraph. alignment default JUSTIFIED for body, START for headings. */
function pAr(children, opts = {}) {
  const kids = Array.isArray(children) ? children : [ar(children, opts.run || {})]
  return new Paragraph({
    bidirectional: true,
    alignment: opts.align ?? AlignmentType.BOTH,
    spacing: { line: 312, after: opts.after ?? 120, before: opts.before ?? 0 },
    indent: opts.indent,
    border: opts.border,
    shading: opts.shading,
    keepNext: opts.keepNext,
    children: kids,
  })
}

function heading1(text) {
  return new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    heading: require("docx").HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200, line: 312 }, keepNext: true,
    children: [ar(text, { size: 32, bold: true, color: "1A1A1A" })],
  })
}
function heading2(text) {
  return new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    heading: require("docx").HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 160, line: 312 }, keepNext: true,
    children: [ar(text, { size: 26, bold: true, color: "3A3A3A" })],
  })
}

/** RTL bullet (manual marker, one item per line). */
function bullet(text, opts = {}) {
  return pAr([ar("•  ", { color: PAL.accent, bold: true }), ...(Array.isArray(text) ? text : [ar(text, opts.run || {})])],
    { align: AlignmentType.START, after: 80, indent: { right: 280 } })
}

// ------------------------------------------------------------ title layout
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title]
  const breakAfter = new Set([..."،。؛：！؟-", ..."-_—–·/", ..." \t"])
  const lines = []
  let remaining = title
  while (remaining.length > charsPerLine) {
    let breakAt = -1
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3))
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break }
      }
    }
    if (breakAt === -1) breakAt = charsPerLine
    lines.push(remaining.slice(0, breakAt).trim())
    remaining = remaining.slice(breakAt).trim()
  }
  if (remaining) lines.push(remaining)
  return lines
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  const charWidth = (pt) => pt * 20
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt))
  let titlePt = preferredPt, lines
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt)
    if (cpl < 2) { titlePt -= 2; continue }
    lines = splitTitleLines(title, cpl)
    if (lines.length <= 3) break
    titlePt -= 2
  }
  if (!lines || lines.length > 3) { lines = splitTitleLines(title, charsPerLine(minPt)); titlePt = minPt }
  return { titlePt, titleLines: lines }
}

function calcCoverSpacing(params) {
  const { titleLineCount = 1, titlePt = 36, hasSubtitle = false, hasEnglishLabel = false,
    metaLineCount = 0, fixedHeight = 800, pageHeight = 16838, marginTop = 0, marginBottom = 0 } = params
  const SAFETY = 1200
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY
  const titleHeight = titleLineCount * (titlePt * 23 + 200)
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0
  const metaHeight = metaLineCount * (10 * 23 + 100)
  const implicitParaHeight = 3 * 300
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight
  const remainingSpace = usableHeight - contentHeight
  const safeRemaining = Math.max(remainingSpace, 400)
  const FOOTER_MIN = 800
  const rawTop = Math.floor(safeRemaining * 0.45)
  const rawBottom = Math.floor(safeRemaining * 0.45)
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN)
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400)
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0)
  return { topSpacing, midSpacing, bottomSpacing }
}

// ------------------------------------------------- Cover R1 (RTL-mirrored, IG-1)
function buildCoverR1RTL(config) {
  const P = config.palette
  const padR = 1200, padL = 800
  const availableWidth = 11906 - padR - padL - 300
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24)
  const titleSize = titlePt * 2
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length, fixedHeight: 400,
  })
  const accentRight = { style: BorderStyle.SINGLE, size: 8, color: P.accent, space: 12 }
  const children = []

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }))

  if (config.englishLabel) {
    children.push(new Paragraph({
      alignment: AlignmentType.END,
      indent: { right: padR, left: padL }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: P.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "), size: 18, sizeComplexScript: 18,
        color: P.accent, font: AR_FONT, characterSpacing: 40 })],
    }))
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [ar(titleLines[i], { size: titleSize, bold: true, color: P.cover.titleColor })],
    }))
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR }, spacing: { after: 800, line: 312 },
      children: [ar(config.subtitle, { size: 24, color: P.cover.subtitleColor })],
    }))
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      bidirectional: true, alignment: AlignmentType.START,
      indent: { right: padR + 200 }, spacing: { after: 80, line: 312 },
      border: { right: accentRight },
      children: [ar(line, { size: 24, color: P.cover.metaColor })],
    }))
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }))

  children.push(new Paragraph({
    bidirectional: true, alignment: AlignmentType.START,
    indent: { right: padR, left: padL },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: P.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      ar(config.footerRight || "", { size: 16, color: P.cover.footerColor }),
      ar("                                   ", { size: 16, color: P.cover.footerColor }),
      ar(config.footerLeft || "", { size: 16, color: P.cover.footerColor }),
    ],
  }))

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
  })]
}

module.exports = { PAL, AR_FONT, ar, pAr, heading1, heading2, bullet, buildCoverR1RTL, allNoBorders, noBorders }
