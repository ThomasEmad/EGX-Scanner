"use client"

// Route-level error boundary. Shows a bilingual, non-technical message and
// never leaks stack traces or internal identifiers to the visitor.

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw } from "lucide-react"

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Server-side logging is handled by the platform; this keeps a client breadcrumb.
    console.error("Route error", error.digest ?? error.message)
  }, [error])

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
        <AlertTriangle className="h-7 w-7" />
      </span>
      <h1 className="text-xl font-semibold">تعذّر تحميل هذه الصفحة — Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        حدث خطأ غير متوقع أثناء تحميل البيانات. لم يتم تعديل أي بيانات. أعد المحاولة، وإذا استمر الخطأ فعّد إلى الصفحة
        الرئيسية.
        <br />
        An unexpected error occurred while loading this page. No data was modified. Try again, or return to the home page
        if it persists.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <RotateCcw className="h-4 w-4" />
          إعادة المحاولة — Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          الرئيسية — Home
        </Link>
      </div>
      {error.digest ? (
        <p className="text-[11px] text-muted-foreground/70">
          Reference: <code>{error.digest}</code>
        </p>
      ) : null}
    </div>
  )
}
