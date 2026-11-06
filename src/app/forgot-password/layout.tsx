import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "استعادة كلمة المرور — EGX Scanner · Forgot password — EGX Scanner",
  description: "استعد الوصول إلى حسابك في EGX Scanner عبر رابط إعادة تعيين آمن. Regain access to your EGX Scanner account via a secure reset link.",
  alternates: { canonical: "/forgot-password" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
