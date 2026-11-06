import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "تنبيهات الأسعار · Price alerts",
  description: "أنشئ تنبيهات سعر لأسهم البورصة المصرية وتابع حالتها لحظة بلحظة. Create price alerts for EGX-listed stocks and track their status.",
  alternates: { canonical: "/alerts" },
}

export default function AlertsLayout({ children }: { children: React.ReactNode }) {
  return children
}
