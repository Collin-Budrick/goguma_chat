import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Yaong-i Chat",
    short_name: "Yaong-i",
    description:
      "A whimsical cat-run chat lounge where Korean, Japanese, and English threads curl up together.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#05010f",
    theme_color: "#05010f",
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
  };
}
