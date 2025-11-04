'use client';

import { useEffect } from "react";

export default function HtmlLangSetter({ locale }: { locale: string }) {
  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dataset.locale = locale;
    if (document.body) {
      document.body.setAttribute("data-locale", locale);
    }
  }, [locale]);

  return null;
}
