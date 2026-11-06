import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EGX Financial Scanner",
    short_name: "EGX Scanner",
    description:
      "Financial data, ratios, sector rankings and valuations for Egyptian Exchange companies.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1220",
    // Arabic-first product: the install UI and standalone window should
    // reflect the primary RTL locale (pages flip dir client-side).
    lang: "ar-EG",
    dir: "rtl",
    id: "/",
    scope: "/",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
