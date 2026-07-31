import type { MetadataRoute } from "next";

/**
 * Web app manifest so Chrome (and other Chromium browsers) can install Planner
 * as a standalone app. Next serves this at `/manifest.webmanifest`.
 *
 * Install criteria: name/short_name, 192+512 icons, start_url, display
 * standalone (or similar). HTTPS in production; localhost is fine for dev.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Planner",
    short_name: "Planner",
    description: "Personal time management, in the spirit of Achieve Planner",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#1b1d23",
    theme_color: "#1b1d23",
    categories: ["productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
