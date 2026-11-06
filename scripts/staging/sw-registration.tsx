"use client"

import { useEffect } from "react"

// Registers the service worker in production only. Dev mode never registers
// (HMR + SW caching fight each other). Registration failures are silent —
// the site works identically without the SW.
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return
    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {})
    }
    if (document.readyState === "complete") onLoad()
    else {
      window.addEventListener("load", onLoad)
      return () => window.removeEventListener("load", onLoad)
    }
  }, [])
  return null
}
