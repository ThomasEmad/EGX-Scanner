"use client"

import Link from "next/link"

export default function TermsClient() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <h1 className="text-2xl font-bold">Terms of Service</h1>
      <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
        <p>
          By accessing or using EGX Financial Scanner, you agree to these terms. If you do not agree, do not use the service.
        </p>
        <p>
          The service is provided &quot;as is&quot; without warranties of any kind. We may update or discontinue features at any time without notice.
        </p>
        <p>
          You are responsible for safeguarding your account credentials and for all activity under your account.
        </p>
        <p>
          Paid subscriptions are billed in advance and are non-refundable except where required by law. Cancellation stops renewal; you retain access until the end of the paid period.
        </p>
      </div>
      <div className="pt-4 border-t">
        <Link href="/" className="text-sm text-primary underline underline-offset-2 hover:text-primary/80">
          Back to home
        </Link>
      </div>
    </div>
  )
}
