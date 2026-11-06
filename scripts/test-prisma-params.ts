import { PrismaClient } from "@prisma/client"
const url = process.env.DATABASE_URL
const db = new PrismaClient({ datasources: { db: { url } } })
const n = await db.company.count()
console.log("companies:", n, "| URL params accepted")
await db.$disconnect()
