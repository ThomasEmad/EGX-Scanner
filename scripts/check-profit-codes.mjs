import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
try {
  const codes = await db.calculatedMetric.findMany({ where: { code: { contains: "profit" } }, distinct: ["code"], select: { code: true } })
  console.log(codes.map(c=>c.code).join("\n"))
  const defs = await db.metricDefinition.findMany({ where: { code: { contains: "PROFIT" } }, select: { code: true, nameEn: true } })
  console.log("DEFS", defs.map(d=>`${d.code}:${d.nameEn}`).join(" | "))
} finally { await db.$disconnect() }
