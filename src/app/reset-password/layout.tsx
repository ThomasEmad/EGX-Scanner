import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "إعادة تعيين كلمة المرور — EGX Scanner · Reset password — EGX Scanner",
  description: "اختر كلمة مرور جديدة لحسابك في EGX Scanner. Choose a new password for your EGX Scanner account.",
  alternates: { canonical: "/reset-password" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
