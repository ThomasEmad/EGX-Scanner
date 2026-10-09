import { NextRequest } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { isPremiumUser } from "@/lib/subscription"

export async function getOptionalUser(req: NextRequest): Promise<{
  userId: string | null
  isPremium: boolean
}> {
  const token = req.headers.get("x-session-token") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return { userId: null, isPremium: false }

  const userId = await getSessionUser(token)
  if (!userId) return { userId: null, isPremium: false }

  const premium = await isPremiumUser(userId)
  return { userId, isPremium: premium }
}
