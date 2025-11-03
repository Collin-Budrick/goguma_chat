import { notFound } from "next/navigation";
import { getRequestConfig } from "next-intl/server";

import type { Locale } from "./routing";
import { routing } from "./routing";

export default getRequestConfig(async ({ locale }) => {
  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  return {
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
