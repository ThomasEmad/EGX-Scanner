import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { isAdminServer } from "@/lib/admin-auth"
import DataQualityClient from "./client"

export const metadata: Metadata = {
  title: "Data quality & integrity — Admin",
  robots: { index: false, follow: false },
}

// Admin-only: the data-quality audit (issues, scores, root causes) is an
// internal operations tool — never shown to end users.
export default async function DataQualityPage() {
  if (!(await isAdminServer())) redirect("/admin/login")
  return <DataQualityClient />
}
