import { NextRequest } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { isAdmin } from "@/lib/admin-auth"
import { isPremiumUser } from "@/lib/subscription"

export function unauthorizedResponse(): Response {
  return Response.json(
    { error: "UNAUTHENTICATED", message: "Authentication required." },
    { status: 401 }
  )
}

export function forbiddenResponse(message = "Premium required."): Response {
  return Response.json(
    { error: "PREMIUM_REQUIRED", message },
    { status: 403 }
  )
}

export function adminUnauthorizedResponse(): Response {
  return Response.json(
    { error: "ADMIN_AUTH_REQUIRED", message: "This action requires admin authentication." },
    { status: 401 }
  )
}

export async function requireAdminOrUser(req: NextRequest): Promise<string | null> {
  if (isAdmin(req)) return "admin"
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (userId) return userId
  return null
}

export async function requireAuth(req: NextRequest): Promise<string | null> {
  const token = req.headers.get("x-session-token") || req.headers.get("authorization")?.replace("Bearer ", "")
  const userId = getSessionUser(token)
  if (!userId) return null
  return userId
}

export async function requirePremium(req: NextRequest): Promise<string | null> {
  const userId = await requireAuth(req)
  if (!userId) return null
  const premium = await isPremiumUser(userId)
  if (!premium) return null
  return userId
}
