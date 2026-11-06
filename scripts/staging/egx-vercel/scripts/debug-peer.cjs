const path = require("node:path")
const { createJiti } = require("jiti")
const root = path.resolve(__dirname, "..")
const jiti = createJiti(path.join(root, "scripts", "debug-peer.cjs"), { interopDefault: true, moduleCache: false, alias: { "@": path.join(root, "src") } })
async function main() {
  const mod = await jiti.import(path.join(root, "src", "app", "api", "v1", "companies", "[id]", "peers", "route.ts"))
  const req = new Request("http://localhost:3000/api/v1/companies/cmui726t3005xbx90f8btgbfc/peers?basis=latest")
  try {
    const res = await mod.GET(req, { params: Promise.resolve({ id: "cmui726t3005xbx90f8btgbfc" }) })
    console.log("status", res.status)
    console.log((await res.text()).slice(0,1000))
  } catch (e) {
    console.error("ERROR", e)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
