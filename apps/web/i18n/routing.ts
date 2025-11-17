export const routing = {
  defaultLocale: "en" as const,
  locales: ["en", "ko"] as const,
  localePrefix: "as-needed" as const,
} as const;

export type Locale = (typeof routing.locales)[number];
