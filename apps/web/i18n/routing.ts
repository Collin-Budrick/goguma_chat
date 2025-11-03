export const routing = {
  defaultLocale: "en",
  locales: ["en", "ko"] as const,
  localePrefix: "as-needed" as const,
};

export type Locale = (typeof routing.locales)[number];
