import type { MetadataRoute } from "next"

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EGX Financial Scanner",
    short_name: "EGX Scanner",
    description:
      "Audited financial data, ratios, sector rankings and data-quality indicators for Egyptian Exchange companies.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1220",
    lang: "en",
    dir: "ltr",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
