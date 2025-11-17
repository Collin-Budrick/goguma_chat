import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

import { routing, type Locale } from "./routing";

export default getRequestConfig(async ({ locale, requestLocale }) => {
  const requestedLocale = locale ?? (await requestLocale);
  const resolvedLocale =
    routing.locales.find((candidate: Locale) => candidate === requestedLocale) ??
    routing.defaultLocale;

  if (!routing.locales.includes(resolvedLocale)) {
    notFound();
  }

  return {
    locale: resolvedLocale,
    messages: (await import(`../messages/${resolvedLocale}.json`)).default,
  };
});
