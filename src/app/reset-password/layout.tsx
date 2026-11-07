import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "إعادة تعيين كلمة المرور — Meza · Reset password — Meza",
  description: "اختر كلمة مرور جديدة لحسابك في Meza. Choose a new password for your Meza account.",
  alternates: { canonical: "/reset-password" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
