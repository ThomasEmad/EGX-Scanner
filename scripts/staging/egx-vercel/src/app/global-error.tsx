"use client"

// Last-resort boundary: replaces the root layout when it fails, so it must
// render its own <html>/<body>. Kept dependency-free and bilingual.

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" dir="ltr">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0b1220",
          color: "#f8fafc",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: 24,
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 520 }}>
          <p style={{ fontSize: 56, fontWeight: 700, margin: 0, color: "#f59e0b" }}>!</p>
          <h1 style={{ fontSize: 20, margin: "12px 0" }}>تعذّر تحميل التطبيق — Application error</h1>
          <p style={{ fontSize: 14, lineHeight: 1.7, color: "#cbd5e1" }}>
            حدث خطأ غير متوقع. لم يتم تعديل أي بيانات. أعد المحاولة من الزر أدناه.
            <br />
            An unexpected error occurred. No data was modified. Please retry below.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              borderRadius: 10,
              border: "1px solid #334155",
              background: "#34d399",
              color: "#052e22",
              padding: "10px 18px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            إعادة المحاولة — Try again
          </button>
          {error.digest ? (
            <p style={{ marginTop: 16, fontSize: 11, color: "#64748b" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
        </main>
      </body>
    </html>
  )
}
