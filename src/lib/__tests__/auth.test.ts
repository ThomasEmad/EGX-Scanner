import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

describe("database-backed sessions", () => {
  it("creates and retrieves a session", async () => {
    const user = await db.user.create({
      data: {
        email: `test-session-${Date.now()}@example.com`,
        passwordHash: "test",
        role: "user",
        isActive: true,
      },
      select: { id: true },
    })

    const { createSession, getSessionUser, invalidateSession } = await import("@/lib/auth")
    const token = await createSession(user.id)
    expect(token).toBeTruthy()

    const fetchedUserId = await getSessionUser(token)
    expect(fetchedUserId).toBe(user.id)

    await invalidateSession(token)
    const afterInvalidation = await getSessionUser(token)
    expect(afterInvalidation).toBeNull()

    await db.user.delete({ where: { id: user.id } })
  })

  it("returns null for expired sessions", async () => {
    const user = await db.user.create({
      data: {
        email: `test-expiry-${Date.now()}@example.com`,
        passwordHash: "test",
        role: "user",
        isActive: true,
      },
      select: { id: true },
    })

    const { createSession, getSessionUser } = await import("@/lib/auth")
    const token = await createSession(user.id)

    await db.session.update({
      where: { token },
      data: { expiresAt: new Date(Date.now() - 1000) },
    })

    const fetchedUserId = await getSessionUser(token)
    expect(fetchedUserId).toBeNull()

    await db.user.delete({ where: { id: user.id } })
  })
})

describe("admin sessions", () => {
  it("creates and validates an admin session", async () => {
    const { adminLogin, isAdmin } = await import("@/lib/admin-auth")
    process.env.ADMIN_PASSCODE = "test-admin-passcode"
    const token = await adminLogin("test-admin-passcode")
    expect(token).toBeTruthy()

    const admin = await isAdmin(new Request("http://localhost", { headers: { cookie: `egx_admin_session=${token}` } }))
    expect(admin).toBe(true)

    const notAdmin = await isAdmin(new Request("http://localhost"))
    expect(notAdmin).toBe(false)
  })
})

afterAll(async () => {
  await db.$disconnect()
})
