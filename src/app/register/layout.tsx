import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "إنشاء حساب — EGX Scanner · Create an account — EGX Scanner",
  description: "أنشئ حساباً مجانياً لمتابعة شركات البورصة المصرية وتلقي التحليلات والتقييمات. Create a free account to track EGX companies, valuations and AI analysis.",
  alternates: { canonical: "/register" },
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children
}
