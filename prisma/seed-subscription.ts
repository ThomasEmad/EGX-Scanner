import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  // Seed default plans
  const freePlan = await db.plan.upsert({
    where: { id: "free" },
    update: {},
    create: {
      id: "free",
      name: "FREE",
      price: 0,
      currency: "EGP",
      durationDays: 0,
      features: JSON.stringify(["basic_companies", "basic_financials", "basic_analysis", "ads"]),
      isActive: true,
      isDefault: true,
      sortOrder: 0,
    },
  })

  const premiumPlan = await db.plan.upsert({
    where: { id: "premium" },
    update: {},
    create: {
      id: "premium",
      name: "PREMIUM",
      price: 99,
      currency: "EGP",
      durationDays: 30,
      features: JSON.stringify(["basic_companies", "basic_financials", "basic_analysis", "advanced_analysis", "full_history", "no_ads"]),
      isActive: true,
      isDefault: false,
      sortOrder: 1,
    },
  })

  console.log(`Seeded plans: ${freePlan.name}, ${premiumPlan.name}`)

  // Seed default settings
  const settings = [
    { key: "PREMIUM_ENABLED", value: "true", type: "boolean", description: "Enable premium subscriptions" },
    { key: "ADS_ENABLED", value: "true", type: "boolean", description: "Enable ads for free users" },
    { key: "PREMIUM_PRICE", value: "99", type: "number", description: "Premium subscription price" },
    { key: "PREMIUM_CURRENCY", value: "EGP", type: "string", description: "Premium subscription currency" },
    { key: "PREMIUM_DURATION_DAYS", value: "30", type: "number", description: "Premium subscription duration in days" },
    { key: "PAYMENT_PHONE", value: "", type: "string", description: "Payment phone number" },
    { key: "WHATSAPP_NUMBER", value: "", type: "string", description: "WhatsApp contact number" },
    { key: "PAYMENT_INSTRUCTIONS", value: "Please transfer the amount and send proof to WhatsApp.", type: "string", description: "Payment instructions shown to users" },
  ]

  for (const s of settings) {
    await db.setting.upsert({
      where: { key: s.key },
      update: { value: s.value, type: s.type, description: s.description },
      create: { key: s.key, value: s.value, type: s.type, description: s.description },
    })
  }
  console.log(`Seeded ${settings.length} settings`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
