import type { Metadata } from "next";
import type { PropsWithChildren } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { Geist, Geist_Mono } from "next/font/google";

import "../globals.css";

import SiteDock from "@/components/site-dock";
import SiteFooter from "@/components/site-footer";
import TransitionViewport from "@/components/transition-viewport";
import { TransitionProvider } from "@/components/transition-context";
import { routing, type Locale } from "@/i18n/routing";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "Metadata" });

  return {
    title: {
      default: t("title"),
      template: t("titleTemplate"),
    },
    description: t("description"),
    metadataBase: new URL("https://goguma.chat"),
    icons: {
      icon: "/favicon.ico",
    },
  } satisfies Metadata;
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: PropsWithChildren<{ params: Promise<{ locale: string }> }>) {
  const { locale } = await params;

  if (!routing.locales.includes(locale as Locale)) {
    notFound();
  }

  const messages = await getMessages({ locale });

  return (
    <html lang={locale}>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-black font-sans text-white antialiased`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
          <TransitionProvider>
            <div className="flex min-h-screen flex-col">
              <TransitionViewport>
                <div className="min-h-full bg-gradient-to-br from-black via-black to-neutral-950 pb-28 lg:pb-36">
                  {children}
                </div>
              </TransitionViewport>
              <SiteFooter />
            </div>
            <SiteDock />
          </TransitionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
