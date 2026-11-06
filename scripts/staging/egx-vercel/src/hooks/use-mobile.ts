import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Media-query subscription. `useSyncExternalStore` keeps the server snapshot
 * stable (desktop) and re-renders when the viewport crosses the breakpoint,
 * without a setState-in-effect cascade.
 */
export function useIsMobile() {
  const subscribe = React.useCallback((onStoreChange: () => void) => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", onStoreChange)
    return () => mql.removeEventListener("change", onStoreChange)
  }, [])

  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false
  )
}
