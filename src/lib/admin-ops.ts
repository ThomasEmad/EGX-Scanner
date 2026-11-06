// Admin operations runner — executes whitelisted data scripts as background
// jobs and keeps a persistent journal + per-run log files.
//
// Security model:
//   • only the fixed WHITELIST below is runnable — no arbitrary commands.
//   • every caller must already be authenticated as admin (checked in the API
//     route; this module never reads cookies itself).
//   • at most ONE data job runs at a time (they all mutate the same SQLite
//     database — concurrent runs would corrupt or race each other).
//
// The journal lives in reports/admin-ops-journal.json so run history survives
// server restarts; liveness of a pid is re-checked with process.kill(pid, 0).

import { spawn } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync } from "node:fs"
import path from "node:path"

// The standalone server chdirs to .next/standalone (server.js does
// process.chdir(__dirname)), so the project root must come from the launcher
// via EGX_ROOT — otherwise journal/log paths and script cwds would land inside
// the build output and be wiped on the next rebuild.
const ROOT = process.env.EGX_ROOT || process.cwd()
const LOG_DIR = path.join(ROOT, "reports", "admin-ops-logs")
const JOURNAL = path.join(ROOT, "reports", "admin-ops-journal.json")

export interface WhitelistEntry {
  key: string
  script: string
  args: string[]
  destructive: boolean
  labelEn: string
  labelAr: string
  descEn: string
  descAr: string
}

export const WHITELIST: WhitelistEntry[] = [
  {
    key: "askborsa_plan",
    script: "scripts/askborsa-sync.mjs",
    args: [],
    destructive: false,
    labelEn: "AskBorsa import — plan (dry run)",
    labelAr: "استيراد AskBorsa — تخطيط (بدون كتابة)",
    descEn: "Harvests all company pages from askborsa.com and builds the import plan. Writes nothing to the database.",
    descAr: "يجمع كل صفحات الشركات من askborsa.com ويبني خطة الاستيراد — لا يكتب أي شيء في قاعدة البيانات.",
  },
  {
    key: "askborsa_apply",
    script: "scripts/askborsa-sync.mjs",
    args: ["--apply", "--recompute"],
    destructive: true,
    labelEn: "AskBorsa import — apply",
    labelAr: "استيراد AskBorsa — تنفيذ",
    descEn: "Runs the same pipeline and WRITES: creates missing reports, fills empty slots only (never overwrites), rollback file + audit log, then recomputes derived metrics. Takes ~8-15 minutes.",
    descAr: "يستورد الفترات الناقصة فقط (لا يعدّل أي قيمة موجودة) مع ملف تراجع وسجل تدقيق، ثم يعيد بناء كل الحسابات. يستغرق 8-15 دقيقة.",
  },
  {
    key: "askborsa_rollback",
    script: "scripts/askborsa-sync.mjs",
    args: ["--rollback"],
    destructive: true,
    labelEn: "AskBorsa import — undo last apply",
    labelAr: "استيراد AskBorsa — تراجع عن آخر تنفيذ",
    descEn: "Reverts the last AskBorsa apply using its rollback file (values + created reports).",
    descAr: "يرجع كل ما أضافه آخر تنفيذ للاستيراد باستخدام ملف التراجع (القيم والتقارير الجديدة).",
  },
  {
    key: "purge_plan",
    script: "scripts/purge-imputed-values.mjs",
    args: [],
    destructive: false,
    labelEn: "Imputed values purge — plan (dry run)",
    labelAr: "تنقية القيم المخترعة — تخطيط (بدون كتابة)",
    descEn: "Counts carry-forward copies, fabricated templates, annual-copy quarters, cross-quarter duplicates and zero placeholders. Writes nothing.",
    descAr: "يعدّ القيم المنسوخة/المصطنعة (نسخ الربع السابق، القوالب، نسخ السنوي، الأصفار البديلة) — بدون أي كتابة.",
  },
  {
    key: "purge_apply",
    script: "scripts/purge-imputed-values.mjs",
    args: ["--apply"],
    destructive: true,
    labelEn: "Imputed values purge — apply",
    labelAr: "تنقية القيم المخترعة — تنفيذ",
    descEn: "Deletes the imputed/non-observed values (with DB backup + full rollback file + audit log) so AskBorsa can re-import real data into the freed slots.",
    descAr: "يحذف القيم المخترعة (مع نسخة احتياطية من القاعدة وملف تراجع كامل) حتى يستوردها السكريبت الحقيقي من جديد.",
  },
  {
    key: "purge_rollback",
    script: "scripts/purge-imputed-values.mjs",
    args: ["--rollback"],
    destructive: true,
    labelEn: "Imputed values purge — undo last apply",
    labelAr: "تنقية القيم المخترعة — تراجع",
    descEn: "Restores the values and empty reports removed by the last purge apply, verbatim.",
    descAr: "يرجع كل قيمة وتقرير حذفه آخر تنفيذ للتنقية حرفيًا كما كان.",
  },
  {
    key: "audit_run",
    script: "scripts/admin-audit-job.mjs",
    args: [],
    destructive: false,
    labelEn: "Integrity audit — run now",
    labelAr: "تدقيق سلامة البيانات — تشغيل الآن",
    descEn: "Runs the full integrity audit engine over all active companies (balance-sheet identity, TTM coherence, cross-period coherence, provenance, coverage, pricing sanity), records an AuditRun with issues + confidence scores. Results appear in Admin → Data quality. Takes a few minutes.",
    descAr: "تشغيل محرك التدقيق الكامل على كل الشركات (توازن الميزانية، تماسك الفترات، المصادر، التغطية، أسعار السوق) — النتائج والملاحظات تظهر في صفحة جودة البيانات. يستغرق دقائق.",
  },
  {
    key: "recompute_all",
    script: "scripts/admin-recompute-job.mjs",
    args: [],
    destructive: false,
    labelEn: "Recompute all metrics — run now",
    labelAr: "إعادة حساب كل المقاييس — تشغيل الآن",
    descEn: "Re-runs the calculation + event engines for every active company (after formula upgrades or bulk fixes) and refreshes the scanner/dashboard caches. Read-only for source values. Takes a few minutes.",
    descAr: "يعيد تشغيل محركات الحساب والأحداث على كل الشركات (بعد تعديل معادلة أو إصلاح بالجملة) ويحدّث كاش السكانر ولوحة القيادة. لا يعدّل القيم المصدرية. يستغرق دقائق.",
  },
  {
    key: "tv_harvest",
    script: "scripts/tradingview-financials-import.mjs",
    args: ["--harvest-only", "--workers=2", "--delay-ms=3500"],
    destructive: false,
    labelEn: "TradingView harvest — collect statements",
    labelAr: "حصاد TradingView — جمع القوائم",
    descEn: "Harvests income/balance/cash-flow statements from TradingView's public symbol pages for every company not yet harvested (resume-aware, polite pacing, auto-cooldown on rate limits). Writes nothing to the database. Auto-stops after 45 minutes — run again to continue where it left off.",
    descAr: "يجمع قوائم الدخل والميزانية والتدفقات النقدية من صفحات الشركات العامة على TradingView لكل شركة لم تُجمع بعد (يستكمل من حيث توقف ويهدأ تلقائياً عند الحظر). لا يكتب في قاعدة البيانات. يتوقف تلقائياً بعد 45 دقيقة — أعد تشغيله للمتابعة من نفس المكان.",
  },
  {
    key: "tv_plan",
    script: "scripts/tradingview-financials-import.mjs",
    args: ["--from-snapshot"],
    destructive: false,
    labelEn: "TradingView import — plan (dry run)",
    labelAr: "استيراد TradingView — تخطيط (بدون كتابة)",
    descEn: "Classifies and validates the harvested snapshot against the database (conflicts, quarter sum-checks, period identity) and prints the import plan. Writes nothing.",
    descAr: "يصنّف ويتحقق من البيانات المجمّعة مقابل قاعدة البيانات (تعارضات، تحقق مجاميع الأرباع، مطابقة الفترات) ويعرض خطة الاستيراد — بدون أي كتابة.",
  },
  {
    key: "tv_apply",
    script: "scripts/tradingview-financials-import.mjs",
    args: ["--from-snapshot", "--apply", "--recompute"],
    destructive: true,
    labelEn: "TradingView import — apply + recompute",
    labelAr: "استيراد TradingView — تنفيذ + إعادة حساب",
    descEn: "Writes the validated plan: creates missing reports, fills empty slots only (never overwrites), rollback file + audit log, then recomputes all derived metrics.",
    descAr: "يكتب الخطة المتحقق منها: ينشئ التقارير الناقصة ويملأ الخانات الفارغة فقط (لا يعدّل أي قيمة موجودة) مع ملف تراجع وسجل تدقيق، ثم يعيد بناء كل الحسابات المشتقة.",
  },
  {
    key: "tv_rollback",
    script: "scripts/tradingview-financials-import.mjs",
    args: ["--rollback"],
    destructive: true,
    labelEn: "TradingView import — undo last apply",
    labelAr: "استيراد TradingView — تراجع عن آخر تنفيذ",
    descEn: "Reverts the last TradingView apply using its rollback file (values + created reports).",
    descAr: "يرجع كل ما أضافه آخر تنفيذ لاستيراد TradingView باستخدام ملف التراجع (القيم والتقارير الجديدة).",
  },
]

export interface JournalEntry {
  id: string
  job: string
  script: string
  args: string[]
  startedAt: string
  endedAt: string | null
  exitCode: number | null
  pid: number
  logFile: string
  /** who terminated the process before it exited on its own */
  stoppedBy?: "admin" | "watchdog"
}

const running = new Map<string, { child: ReturnType<typeof spawn>; entry: JournalEntry }>()

// Watchdog: a hung script would block the single-flight runner forever (and
// the SQLite database with it). The longest legitimate job is the AskBorsa
// apply (~15 min), so 45 min is a safe ceiling — after that the runner kills
// the process and frees the slot.
const MAX_RUNTIME_MS = 45 * 60 * 1000
const SIGKILL_GRACE_MS = 10_000
const watchdogs = new Map<string, ReturnType<typeof setTimeout>>()

function readJournal(): JournalEntry[] {
  try {
    if (!existsSync(JOURNAL)) return []
    const raw = JSON.parse(readFileSync(JOURNAL, "utf8"))
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

function writeJournal(entries: JournalEntry[]) {
  // Vercel/serverless filesystems are read-only — the journal is a
  // self-hosting nicety, not a correctness requirement. Persist best-effort.
  try {
    mkdirSync(path.dirname(JOURNAL), { recursive: true })
    writeFileSync(JOURNAL, JSON.stringify(entries.slice(-40), null, 2), "utf8")
  } catch {
    // read-only FS or missing permissions — skip journal persistence
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export function anyRunning(): boolean {
  for (const { entry } of running.values()) if (pidAlive(entry.pid)) return true
  return false
}

export function jobByKey(key: string): WhitelistEntry | undefined {
  return WHITELIST.find((j) => j.key === key)
}

export function startJob(key: string): { ok: true; entry: JournalEntry } | { ok: false; error: string } {
  const job = jobByKey(key)
  if (!job) return { ok: false, error: `unknown job "${key}"` }
  // clean stale in-memory entries whose pid died (e.g. after a restart)
  for (const [id, r] of running) if (!pidAlive(r.entry.pid)) running.delete(id)
  if (running.size > 0) {
    return { ok: false, error: `another job is still running: ${[...running.values()][0].entry.job} — wait for it to finish or check its log` }
  }

  let id: string
  let fd: number
  let logFile: string
  try {
    mkdirSync(LOG_DIR, { recursive: true })
    id = `${key}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`
    logFile = path.join(LOG_DIR, `${id}.log`)
    fd = openSync(logFile, "a")
  } catch {
    return { ok: false, error: "Admin ops require a writable server filesystem (not available on serverless hosting)" }
  }
  const child = spawn(process.execPath, [path.join(ROOT, job.script), ...job.args], {
    cwd: ROOT,
    stdio: ["ignore", fd, fd],
    env: { ...process.env },
  })
  const entry: JournalEntry = {
    id,
    job: job.key,
    script: job.script,
    args: job.args,
    startedAt: new Date().toISOString(),
    endedAt: null,
    exitCode: null,
    pid: child.pid ?? 0,
    logFile,
  }
  writeJournal([...readJournal(), entry])
  running.set(id, { child, entry })

  const finish = () => {
    const w = watchdogs.get(id)
    if (w) { clearTimeout(w); watchdogs.delete(id) }
  }
  child.on("exit", (code, signal) => {
    entry.endedAt = new Date().toISOString()
    // a process killed by a signal reports code=null — record the conventional
    // exit status so the UI can tell "stopped" from "done"
    entry.exitCode = code ?? (signal === "SIGKILL" ? 137 : signal ? 143 : null)
    const all = readJournal().map((e) => (e.id === id ? entry : e))
    writeJournal(all)
    running.delete(id)
    finish()
  })

  const watchdog = setTimeout(() => {
    watchdogs.delete(id)
    if (running.has(id) && pidAlive(entry.pid)) {
      killJob(id, "watchdog")
    }
  }, MAX_RUNTIME_MS)
  watchdogs.set(id, watchdog)

  return { ok: true, entry }
}

/**
 * Stop a running job (admin action or watchdog). SIGTERM first, SIGKILL after
 * a grace period. Works on jobs started by the current server lifetime (child
 * handle) and on orphaned-but-alive pids after a restart (journal + pid).
 */
export function killJob(
  runId: string,
  by: "admin" | "watchdog" = "admin"
): { ok: true; entry: JournalEntry } | { ok: false; error: string } {
  const entry = running.get(runId)?.entry ?? readJournal().find((e) => e.id === runId)
  if (!entry) return { ok: false, error: "run not found" }
  if (entry.endedAt !== null) return { ok: false, error: "run already finished" }
  if (!pidAlive(entry.pid)) return { ok: false, error: "process is not running" }

  const child = running.get(runId)?.child
  if (child) {
    child.kill("SIGTERM")
  } else {
    try {
      process.kill(entry.pid, "SIGTERM")
    } catch {
      return { ok: false, error: "process could not be signalled" }
    }
  }

  entry.stoppedBy = by
  // escalate to SIGKILL if the process ignores SIGTERM
  setTimeout(() => {
    if (!pidAlive(entry.pid)) return
    if (running.get(runId)?.child) {
      running.get(runId)!.child.kill("SIGKILL")
    } else {
      try { process.kill(entry.pid, "SIGKILL") } catch {}
    }
  }, SIGKILL_GRACE_MS)

  // reconcile the journal even if the exit event never fires (orphaned pid)
  setTimeout(() => {
    if (pidAlive(entry.pid)) return
    if (entry.endedAt === null) {
      entry.endedAt = new Date().toISOString()
      entry.exitCode = entry.exitCode ?? 143
      writeJournal(readJournal().map((e) => (e.id === entry.id ? entry : e)))
    }
    running.delete(runId)
  }, SIGKILL_GRACE_MS + 1_000)

  return { ok: true, entry }
}

/** Journal + liveness reconciliation (works across server restarts). */
export function listRuns(limit = 20): JournalEntry[] {
  const all = readJournal().slice().reverse()
  const liveIds = new Set([...running.values()].map((r) => r.entry.id))
  return all.slice(0, limit).map((e) =>
    e.endedAt === null && !liveIds.has(e.id) && !pidAlive(e.pid)
      ? { ...e, endedAt: null, exitCode: null, logFile: e.logFile + " (process not running — probably killed by a server restart)" }
      : e
  )
}

export function runningJobs(): JournalEntry[] {
  for (const [id, r] of running) if (!pidAlive(r.entry.pid)) running.delete(id)
  return [...running.values()].map((r) => r.entry)
}

/** Last N lines of a run's log. */
export function tailLog(runId: string, lines = 120): { ok: true; text: string; running: boolean } | { ok: false; error: string } {
  const entry = readJournal().find((e) => e.id === runId)
  if (!entry) return { ok: false, error: "run not found" }
  const isRunning = [...running.values()].some((r) => r.entry.id === runId) && pidAlive(entry.pid)
  try {
    if (!existsSync(entry.logFile)) return { ok: true, text: "", running: isRunning }
    const buf = readFileSync(entry.logFile, "utf8")
    const arr = buf.split("\n")
    return { ok: true, text: arr.slice(-lines).join("\n"), running: isRunning }
  } catch {
    return { ok: false, error: "log unreadable" }
  }
}
