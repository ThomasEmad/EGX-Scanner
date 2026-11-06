// TEMPORARY (pre-production) — inline editing from the website.
// While true, admins see edit affordances on the company page (edit financial
// values, add missing metrics, add whole new statement periods) and the edit
// APIs stay reachable. Flip to false before production launch to hide every
// editing affordance in one place; the underlying endpoints remain admin-token
// gated either way.
export const TEMP_EDIT_MODE = process.env.NEXT_PUBLIC_TEMP_EDIT_MODE === "true"
