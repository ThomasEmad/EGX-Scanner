const r = await fetch("http://localhost:3000/api/v1/companies/cmui726t3005xbx90f8btgbfc/peers?basis=latest")
console.log(r.status)
console.log((await r.text()).slice(0,2000))
