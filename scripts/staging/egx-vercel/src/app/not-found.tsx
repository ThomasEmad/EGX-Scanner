import Link from "next/link"

// App-level 404 — bilingual, on-brand, with a way back to the dashboard.

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-8 text-center">
      <p className="text-6xl font-bold tracking-tight text-primary/30">404</p>
      <h1 className="text-xl font-semibold">الصفحة غير موجودة — Page not found</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        الرابط الذي فتحته غير صحيح أو تم نقله. عُد إلى لوحة البداية وابحث عن الشركة أو الماسح الذي تريده.
        <br />
        The link you opened doesn&apos;t exist or has moved. Head back to the dashboard to find the company or scanner you need.
      </p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        العودة للوحة البداية — Back to dashboard
      </Link>
    </div>
  )
}
