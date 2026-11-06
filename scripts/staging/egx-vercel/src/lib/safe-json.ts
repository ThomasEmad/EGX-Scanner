// JSON serialization hardened for embedding inside <script> tags.
//
// JSON.stringify does NOT escape `<`, so any string value containing
// `</script>` (e.g. a crafted company name from the database) closes the
// enclosing JSON-LD <script> element and injects arbitrary HTML/JS — the
// classic stored-XSS breakout. Escaping `<`, `>`, `&` and the U+2028/U+2029
// line separators keeps the JSON valid for parsers while making it inert
// inside HTML.

export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}
