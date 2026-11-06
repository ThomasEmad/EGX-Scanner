import type { Metadata } from "next"
import Link from "next/link"

export const metadata: Metadata = {
  title: "غير متصل · Offline",
  robots: { index: false, follow: false },
}

export default function OfflinePage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-lg font-bold">
        <span dir="auto">لا يوجد اتصال</span>
        <span className="mx-1 text-muted-foreground" aria-hidden>·</span>
        You are offline
      </h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        <span dir="auto">تعذّر الوصول للمنصة — تحقق من اتصالك ثم أعد المحاولة. الصفحات التي زرتها سابقاً قد تعمل من الذاكرة المؤقتة.</span>
        <br />
        The platform is unreachable right now — check your connection and retry. Previously visited pages may load from cache.
      </p>
      <Link href="/" className="text-sm font-semibold text-primary hover:underline">
        <span dir="auto">إعادة المحاولة</span> · Retry
      </Link>
    </div>
  )
}
