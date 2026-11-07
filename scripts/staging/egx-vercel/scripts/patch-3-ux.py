#!/usr/bin/env python3
"""Patch 3 — UX: unified footer + auth-page metadata + manifest + PWA polish.

  A. LayoutShell renders <AppFooter /> for every page; remove the 6 per-page
     footer usages (some pages rendered it twice for loading+content states).
  B. Per-route layouts give /login /register /forgot-password /reset-password
     /alerts real titles/descriptions (client pages cannot export metadata).
  C. manifest.ts — lang/dir reflect the Arabic-first product; add id+scope.
  D. Rate-limit entry for the new change-password + session endpoints.
"""
import pathlib

ROOT = pathlib.Path("/tmp/my-project")


def patch(rel: str, old: str, new: str, count: int = 1) -> None:
    p = ROOT / rel
    s = p.read_text()
    n = s.count(old)
    assert n == count, f"{rel}: expected {count} occurrence(s), found {n}"
    p.write_text(s.replace(old, new))
    print(f"[ok] {rel}")


# ---------------------------------------------------------- A: unified footer
patch("src/components/layout/LayoutShell.tsx",
'''import { TopHeader } from "./TopHeader"
import { MobileBottomNav } from "./MobileBottomNav"
import { AppSidebar } from "./AppSidebar"''',
'''import { TopHeader } from "./TopHeader"
import { MobileBottomNav } from "./MobileBottomNav"
import { AppSidebar } from "./AppSidebar"
import { AppFooter } from "@/components/egx/app-footer"''')

patch("src/components/layout/LayoutShell.tsx",
"""          {children}
        </main>
      </div>""",
"""          {children}
        </main>

        <AppFooter />
      </div>""")

# remove per-page usages (import line + bare <AppFooter /> lines)
FOOTER_FILES = [
    "src/app/about/client.tsx",
    "src/app/landing-client.tsx",
    "src/app/portfolio/client.tsx",
    "src/app/privacy/privacy-client.tsx",
    "src/app/undervalued/client.tsx",
    "src/app/watchlist/client.tsx",
]
for rel in FOOTER_FILES:
    p = ROOT / rel
    lines = p.read_text().splitlines(keepends=True)
    out = [ln for ln in lines
           if 'import { AppFooter } from "@/components/egx/app-footer"' not in ln
           and ln.strip() != "<AppFooter />"]
    removed = len(lines) - len(out)
    assert removed >= 2, f"{rel}: expected >=2 lines removed, got {removed}"
    p.write_text("".join(out))
    print(f"[ok] {rel} (-{removed} lines)")

# ---------------------------------------------------------- B: metadata layouts
LAYOUTS = {
    "src/app/login/layout.tsx": (
        'تسجيل الدخول — Meza',
        'Sign in to Meza',
        'ادخل إلى حسابك لمتابعة قائمة المتابعة والمحفظة والتنبيهات وتحليلات الذكاء الاصطناعي لشركات البورصة المصرية.',
        'Sign in to your account to use watchlists, portfolio tracking, alerts and AI company analysis.',
    ),
    "src/app/register/layout.tsx": (
        'إنشاء حساب — Meza',
        'Create an account — Meza',
        'أنشئ حساباً مجانياً لمتابعة شركات البورصة المصرية وتلقي التحليلات والتقييمات.',
        'Create a free account to track EGX companies, valuations and AI analysis.',
    ),
    "src/app/forgot-password/layout.tsx": (
        'استعادة كلمة المرور — Meza',
        'Forgot password — Meza',
        'استعد الوصول إلى حسابك في Meza عبر رابط إعادة تعيين آمن.',
        'Regain access to your Meza account via a secure reset link.',
    ),
    "src/app/reset-password/layout.tsx": (
        'إعادة تعيين كلمة المرور — Meza',
        'Reset password — Meza',
        'اختر كلمة مرور جديدة لحسابك في Meza.',
        'Choose a new password for your Meza account.',
    ),
    "src/app/alerts/layout.tsx": (
        'تنبيهات الأسعار — Meza',
        'Price alerts — Meza',
        'أنشئ تنبيهات سعر لأسهم البورصة المصرية وتابع حالتها لحظة بلحظة.',
        'Create price alerts for EGX-listed stocks and track their status.',
    ),
}
TEMPLATE = '''import type { Metadata } from "next"

export const metadata: Metadata = {
  title: {title},
  description: {desc},
  alternates: { canonical: "{canonical}" },
}

export default function {name}Layout({{ children }}: {{ children: React.ReactNode }}) {{
  return children
}}
'''
for path, (t_ar, t_en, d_ar, d_en) in LAYOUTS.items():
    p = ROOT / path
    assert not p.exists(), f"{path} already exists"
    canonical = "/" + path.split("/")[2]
    name = "".join(w.capitalize() for w in path.split("/")[2].split("-"))
    body = (TEMPLATE
            .replace("{title}", t_ar + " · " + t_en)
            .replace("{desc}", d_ar + " " + d_en)
            .replace("{canonical}", canonical)
            .replace("{name}", name))
    p.write_text(body)
    print(f"[ok] created {path}")

# ---------------------------------------------------------- C: manifest
patch("src/app/manifest.ts",
'''    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1220",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "business", "productivity"],''',
'''    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1220",
    // Arabic-first product: the install UI and standalone window should
    // reflect the primary RTL locale (pages flip dir client-side).
    lang: "ar-EG",
    dir: "rtl",
    id: "/",
    scope: "/",
    categories: ["finance", "business", "productivity"],''')

# ---------------------------------------------------------- D: rate limits
patch("src/lib/rate-limit.ts",
'''  "auth-oauth-callback": { key: "oauth-callback", max: 20, windowMs: 10 * 60 * 1000 },''',
'''  "auth-oauth-callback": { key: "oauth-callback", max: 20, windowMs: 10 * 60 * 1000 },
  "auth-change-password": { key: "change-password", max: 5, windowMs: 60 * 60 * 1000 },
  "auth-session": { key: "auth-session", max: 30, windowMs: 10 * 60 * 1000 },''')

print("patch-3 complete")
