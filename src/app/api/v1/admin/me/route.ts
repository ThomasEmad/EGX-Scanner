import { NextRequest } from "next/server"
import { isAdmin } from "@/lib/admin-auth"

// GET /api/v1/admin/me — check if the current request has a valid admin session.
// Returns { isAdmin: boolean } based on the HttpOnly admin session cookie.
export async function GET(req: NextRequest) {
  const admin = await isAdmin(req)
  return Response.json({ isAdmin: admin })
}
