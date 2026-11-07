import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "استعادة كلمة المرور — Meza · Forgot password — Meza",
  description: "استعد الوصول إلى حسابك في Meza عبر رابط إعادة تعيين آمن. Regain access to your Meza account via a secure reset link.",
  alternates: { canonical: "/forgot-password" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
