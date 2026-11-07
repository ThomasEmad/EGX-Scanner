// Transactional email — dual-provider, env-gated, graceful degradation.
//
// Two interchangeable transports behind one `sendMail()`:
//   1. Resend HTTP API (zero-dependency fetch) — best once a domain is
//      verified; RESEND_API_KEY + MAIL_FROM.
//   2. SMTP (nodemailer) — works today with a Gmail App Password, no custom
//      domain needed: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=
//      <gmail address>, SMTP_PASS=<16-char app password>.
//
// Provider selection (first match wins):
//   MAIL_PROVIDER="smtp" | "resend"  (explicit)
//   else SMTP_HOST + SMTP_USER + SMTP_PASS set  → smtp
//   else RESEND_API_KEY set                     → resend
//   else not configured → callers fall back to the manual audit-log delivery
//        (reset tokens land in the audit log for admin hand-off), so nothing
//        breaks and no capability is silently lost.
//
// MAIL_FROM — "Meza <sender@gmail.com>". With Gmail SMTP the address
// part must match SMTP_USER (Google rewrites anything else).
// NEXT_PUBLIC_SITE_URL — used for password-reset links (falls back to the
// request origin passed by the caller).

import { audit } from "@/lib/audit"
import nodemailer from "nodemailer"

export interface MailInput {
  to: string
  subject: string
  html: string
  text: string
}

export interface MailResult {
  delivered: boolean
  id?: string
  reason?: "not_configured" | "http_error" | "invalid_response"
  status?: number
}

function activeProvider(): "smtp" | "resend" | null {
  const explicit = (process.env.MAIL_PROVIDER || "").trim().toLowerCase()
  if (explicit === "smtp") return smtpConfigured() ? "smtp" : null
  if (explicit === "resend") return process.env.RESEND_API_KEY ? "resend" : null
  if (smtpConfigured()) return "smtp"
  if (process.env.RESEND_API_KEY) return "resend"
  return null
}

function smtpConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

export function mailConfigured(): boolean {
  return activeProvider() !== null
}

async function sendViaSmtp(input: MailInput): Promise<MailResult> {
  const port = Number(process.env.SMTP_PORT || 465)
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER as string, pass: process.env.SMTP_PASS as string },
  })
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  })
  return { delivered: true, id: info?.messageId }
}

async function sendViaResend(input: MailInput): Promise<MailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.MAIL_FROM
  if (!apiKey || !from) {
    return { delivered: false, reason: "not_configured" }
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to: [input.to], subject: input.subject, html: input.html, text: input.text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      console.error(`[mail] resend ${res.status}: ${body.slice(0, 300)}`)
      return { delivered: false, reason: "http_error", status: res.status }
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null
    if (!data?.id) return { delivered: false, reason: "invalid_response", status: res.status }
    return { delivered: true, id: data.id }
  } catch (e) {
    console.error("[mail] send failed", e instanceof Error ? e.message : e)
    return { delivered: false, reason: "http_error" }
  }
}

export async function sendMail(input: MailInput): Promise<MailResult> {
  const provider = activeProvider()
  if (!provider) return { delivered: false, reason: "not_configured" }
  try {
    return provider === "smtp" ? await sendViaSmtp(input) : await sendViaResend(input)
  } catch (e) {
    console.error(`[mail:${provider}] send failed`, e instanceof Error ? e.message : e)
    return { delivered: false, reason: "http_error" }
  }
}

// ---------------------------------------------------------------------------
// Shared layout — bilingual (Arabic RTL primary, English secondary), inline
// styles only (email clients strip <style> tags), no external assets.
// ---------------------------------------------------------------------------

const BRAND = "Meza"

function layout(titleAr: string, titleEn: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;border:1px solid #e5e7eb;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #eef0f3;">
          <span style="font-size:18px;font-weight:700;color:#0f172a;">📈 ${BRAND}</span>
        </td></tr>
        <tr><td style="padding:28px;color:#111827;font-size:15px;line-height:1.8;" dir="rtl">
          <h2 style="margin:0 0 12px;font-size:19px;color:#0f172a;">${titleAr}</h2>
          <p style="margin:0 0 8px;color:#374151;">${bodyHtml}</p>
        </td></tr>
        <tr><td style="padding:20px 28px;border-top:1px solid #eef0f3;" dir="ltr">
          <h3 style="margin:0 0 8px;font-size:15px;color:#0f172a;">${titleEn}</h3>
          <p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6;">
            You received this email because a request was made on ${BRAND}.
            If this wasn't you, you can safely ignore it.
          </p>
        </td></tr>
        <tr><td style="padding:14px 28px;background:#fafbfc;border-radius:0 0 12px 12px;" dir="ltr">
          <span style="color:#9ca3af;font-size:11px;">${BRAND} — Egyptian Exchange analytics · ${new Date().getFullYear()}</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

export function passwordResetEmail(opts: { url: string; minutes: number }): { subject: string; html: string; text: string } {
  const { url, minutes } = opts
  return {
    subject: `${BRAND} — تعيين كلمة سر جديدة / Reset your password`,
    html: layout(
      "طلب إعادة تعيين كلمة السر",
      "Password reset request",
      `اضغط على الزر التالي لاختيار كلمة سر جديدة. الرابط صالح لمدة <b>${minutes} دقيقة</b> ولمرة استخدام واحدة فقط.
       <br><br>
       <a href="${url}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">تعيين كلمة السر</a>
       <br><br>
       إذا لم يعمل الزر، انسخ الرابط التالي والصقه في المتصفح:<br>
       <span dir="ltr" style="color:#2563eb;word-break:break-all;font-size:13px;">${url}</span>`
    ),
    text: `إعادة تعيين كلمة السر (صالحة ${minutes} دقيقة، استخدام واحد):\n${url}\n\nPassword reset link (valid ${minutes} minutes, single use):\n${url}\n\nIf you didn't request this, ignore this email.`,
  }
}

export function welcomeEmail(opts: { name: string | null; siteUrl: string }): { subject: string; html: string; text: string } {
  const name = opts.name?.trim()
  return {
    subject: `${BRAND} — أهلاً بك! / Welcome aboard`,
    html: layout(
      `أهلاً بك${name ? ` يا ${name}` : ""} في ${BRAND} 👋`,
      `Welcome to ${BRAND}`,
      `حسابك جاهز الآن. ابدأ باستكشاف أسهم البورصة المصرية: التقييمات، الترتيب، القطاعات، وقوائم المتابعة والتنبيهات.
       <br><br>
       <a href="${opts.siteUrl}/companies" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:11px 22px;border-radius:8px;font-weight:600;">تصفح الشركات</a>`
    ),
    text: `أهلاً بك في ${BRAND}! ابدأ من: ${opts.siteUrl}/companies\n\nWelcome to ${BRAND} — start at ${opts.siteUrl}/companies`,
  }
}

// ---------------------------------------------------------------------------
// High-level helpers used by API routes
// ---------------------------------------------------------------------------

/** Public site URL for links inside emails: NEXT_PUBLIC_SITE_URL or the request origin. */
export function siteUrlFor(req: Request): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "")
  if (configured) return configured
  try {
    return new URL(req.url).origin
  } catch {
    return ""
  }
}

/**
 * Send the password-reset mail. Returns true when actually delivered.
 * The caller falls back to audit-log token hand-off when this returns false.
 */
export async function sendPasswordResetMail(to: string, url: string, minutes: number): Promise<boolean> {
  if (!mailConfigured()) return false
  const tpl = passwordResetEmail({ url, minutes })
  const result = await sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text })
  if (result.delivered) {
    await audit("MAIL_SENT", {
      actor: "system",
      entityType: "User",
      details: `Password reset email delivered to ${to} via Resend (id ${result.id})`,
    }).catch(() => {})
  }
  return result.delivered
}

/** Fire-and-forget welcome mail — must never delay or break registration. */
export function sendWelcomeMail(to: string, name: string | null, siteUrl: string): void {
  if (!mailConfigured()) return
  const tpl = welcomeEmail({ name, siteUrl })
  void sendMail({ to, subject: tpl.subject, html: tpl.html, text: tpl.text }).catch(() => {})
}
