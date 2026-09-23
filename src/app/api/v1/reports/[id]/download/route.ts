import { readFile, stat } from "node:fs/promises"
import path from "node:path"
import { db } from "@/lib/db"

// GET /api/v1/reports/[id]/download — download the original stored document
// (source traceability: the raw file that produced the extracted values).

const MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".csv": "text/csv; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".bin": "application/octet-stream",
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const report = await db.financialReport.findUnique({ where: { id }, select: { localFileRef: true, periodLabel: true, fileHash: true } })
  if (!report?.localFileRef) {
    return Response.json({ error: "NOT_FOUND", message: "This report has no stored document (seeded reports have no source file)." }, { status: 404 })
  }
  try {
    await stat(report.localFileRef)
  } catch {
    return Response.json({ error: "GONE", message: "Stored document is missing on disk." }, { status: 410 })
  }
  const buffer = await readFile(report.localFileRef)
  const ext = path.extname(report.localFileRef).toLowerCase()
  const filename = `report-${report.periodLabel.replace(/\s+/g, "-")}${ext || ".bin"}`
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": MIME[ext] ?? MIME[".bin"],
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(buffer.length),
      "X-Content-SHA256": report.fileHash ?? "",
    },
  })
}
