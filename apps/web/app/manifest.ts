import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/?source=pwa",
    name: "Yaong-i Chat",
    short_name: "Yaong-i",
    description:
      "A whimsical cat-run chat lounge where Korean, Japanese, and English threads curl up together.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone"],
    background_color: "#05010f",
    theme_color: "#05010f",
    categories: ["social", "productivity"],
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
    shortcuts: [
      {
        name: "Open chat",
        short_name: "Chat",
        url: "/en/app/chat",
        description: "Jump directly into your most recent conversations.",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "View contacts",
        short_name: "Contacts",
        url: "/en/app/contacts",
        description: "Review your roster and pending invites.",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
