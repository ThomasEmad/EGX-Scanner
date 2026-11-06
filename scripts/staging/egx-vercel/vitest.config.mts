import { defineConfig } from "vitest/config"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    // Tests must never depend on shell/env DATABASE_URL (which may point at a
    // production DB or a nonexistent platform default). Pin a dedicated
    // schema-only SQLite file (prisma/test.db, created via `prisma db push`).
    env: {
      DATABASE_URL: `file:${path.join(root, "prisma", "test.db")}`,
      ADMIN_PASSCODE: process.env.ADMIN_PASSCODE || "test-admin-passcode",
      CRON_SECRET: process.env.CRON_SECRET || "test-cron-secret",
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
    },
  },
})
