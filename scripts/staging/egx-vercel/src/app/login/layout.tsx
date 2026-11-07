import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "تسجيل الدخول — Meza · Sign in to Meza",
  description: "ادخل إلى حسابك لمتابعة قائمة المتابعة والمحفظة والتنبيهات وتحليلات الذكاء الاصطناعي لشركات البورصة المصرية. Sign in to your account to use watchlists, portfolio tracking, alerts and AI company analysis.",
  alternates: { canonical: "/login" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
