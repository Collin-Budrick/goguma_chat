import type { MetadataRoute } from "next";

import { routing } from "@/i18n/routing";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://goguma.chat").replace(/\/+$/, "");

  const marketingPaths = [
    "",
    "/about",
    "/capture",
    "/contact",
    "/integrations",
    "/login",
    "/privacy",
    "/signup",
    "/status",
    "/support",
    "/terms",
  ];

  const workspacePaths = [
    "/app/chat",
    "/app/contacts",
    "/app/dashboard",
    "/app/settings",
    "/profile",
  ];

  const entries: MetadataRoute.Sitemap = [];

  routing.locales.forEach((locale) => {
    marketingPaths.forEach((path) => {
      entries.push({
        url: `${baseUrl}/${locale}${path}`,
        changeFrequency: "weekly",
        priority: path === "" ? 1 : 0.6,
      });
    });
    workspacePaths.forEach((path) => {
      entries.push({
        url: `${baseUrl}/${locale}${path}`,
        changeFrequency: "weekly",
        priority: 0.5,
      });
    });
  });

  return entries;
}
