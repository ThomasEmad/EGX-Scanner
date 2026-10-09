// Client-side admin auth helpers.
// Admin identity is now carried in an HttpOnly cookie, so client code should
// never read or write the token directly.

export async function isAdminClient(): Promise<boolean> {
  if (typeof window === "undefined") return false
  try {
    const res = await fetch("/api/v1/admin/me", { credentials: "include" })
    if (!res.ok) return false
    const data = await res.json()
    return !!data.isAdmin
  } catch {
    return false
  }
}

export async function adminLogout(): Promise<void> {
  if (typeof window === "undefined") return
  try {
    await fetch("/api/v1/admin/login", {
      method: "DELETE",
      credentials: "include",
    })
  } catch {
    // best-effort logout
  }
}
