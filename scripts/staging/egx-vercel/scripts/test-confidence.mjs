for (const id of ["cmui726t3005xbx90f8btgbfc", "UNIT", "unit", "EGS69121C016"]) {
  const r = await fetch(`http://localhost:3000/api/v1/companies/${encodeURIComponent(id)}/confidence`)
  const j = await r.json()
  console.log(r.status, id, JSON.stringify(j).slice(0, 300))
}
