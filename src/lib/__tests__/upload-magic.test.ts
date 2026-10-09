import { describe, it, expect } from "vitest"

const MAGIC_SIGNATURES: Record<string, { bytes: number[]; minLen: number; label: string }> = {
  ".pdf": { bytes: [0x25, 0x50, 0x44, 0x46, 0x2D], minLen: 5, label: "%PDF-" },
  ".csv": { bytes: [], minLen: 0, label: "text" },
  ".txt": { bytes: [], minLen: 0, label: "text" },
}

function validateMagic(buffer: Buffer, ext: string): { ok: boolean; error?: string } {
  const magic = MAGIC_SIGNATURES[ext]
  if (!magic) return { ok: true }
  if (magic.bytes.length > 0) {
    const header = buffer.subarray(0, magic.minLen)
    const actual = Array.from(header).map((b) => String.fromCharCode(b)).join("")
    if (!actual.startsWith(magic.label)) {
      return { ok: false, error: `Expected ${magic.label} signature for ${ext}` }
    }
  } else if (magic.label === "text") {
    const firstChunk = buffer.subarray(0, Math.min(1024, buffer.length))
    if (firstChunk.includes(0)) {
      return { ok: false, error: "Binary null bytes found in text file" }
    }
  }
  return { ok: true }
}

describe("file upload magic-byte validation", () => {
  it("accepts a valid PDF", () => {
    const pdfHeader = Buffer.from("%PDF-1.7\n")
    const result = validateMagic(pdfHeader, ".pdf")
    expect(result.ok).toBe(true)
  })

  it("rejects a fake PDF (exe header)", () => {
    const exeHeader = Buffer.from("MZ\x90\x00\x03\x00\x00\x00")
    const result = validateMagic(exeHeader, ".pdf")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("%PDF-")
  })

  it("accepts a valid CSV", () => {
    const csv = Buffer.from("Name,Value\nEGX,100\n")
    const result = validateMagic(csv, ".csv")
    expect(result.ok).toBe(true)
  })

  it("rejects a binary CSV with null bytes", () => {
    const fakeCsv = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04])
    const result = validateMagic(fakeCsv, ".csv")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Binary null bytes")
  })

  it("accepts a valid TXT", () => {
    const txt = Buffer.from("Hello, this is a text file.\n")
    const result = validateMagic(txt, ".txt")
    expect(result.ok).toBe(true)
  })

  it("rejects a binary TXT with null bytes", () => {
    const fakeTxt = Buffer.from("Hello\x00World")
    const result = validateMagic(fakeTxt, ".txt")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("Binary null bytes")
  })
})
