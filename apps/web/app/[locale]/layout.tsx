import type { Metadata, Viewport } from "next";
import type { PropsWithChildren } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import SiteDock from "@/components/site-dock";
import SiteFooter from "@/components/site-footer";
import TransitionViewport from "@/components/transition-viewport";
import { TransitionProvider } from "@/components/transition-context";
import HtmlLangSetter from "@/components/html-lang-setter";
import { routing, type Locale } from "@/i18n/routing";

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
		applicationName: t("title"),
		metadataBase: new URL("https://goguma.chat"),
		manifest: "/manifest.webmanifest",
		appleWebApp: {
			capable: true,
			title: t("title"),
			statusBarStyle: "black-translucent",
		},
		icons: {
			icon: [
				{ url: "/favicon.ico" },
				{ url: "/icons/icon-192x192.png", sizes: "192x192", type: "image/png" },
				{ url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
			],
			apple: [
				{ url: "/icons/icon-512x512.png", sizes: "512x512", type: "image/png" },
			],
		},
	} satisfies Metadata;
}

export const viewport: Viewport = {
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f9fafb" },
		{ media: "(prefers-color-scheme: dark)", color: "#05010f" },
	],
};

export function generateStaticParams() {
	return routing.locales.map((locale: Locale) => ({ locale }));
}

export default function LocaleLayout(
	props: PropsWithChildren<{ params: Promise<{ locale: string }> }>,
) {
	return (
		<Suspense fallback={<LocaleLayoutShell />}>
			<LocaleLayoutContent {...props} />
		</Suspense>
	);
}

async function LocaleLayoutContent({
	children,
	params,
}: PropsWithChildren<{ params: Promise<{ locale: string }> }>) {
	const { locale } = await params;

	if (!routing.locales.includes(locale as Locale)) {
		notFound();
	}

	const messages = await getMessages({ locale });

	return (
		<NextIntlClientProvider locale={locale} messages={messages}>
			<HtmlLangSetter locale={locale} />
			<TransitionProvider>
				<div className="app-shell flex min-h-screen flex-col">
					<TransitionViewport>
						<div className="app-gradient min-h-full flex flex-col gap-10 bg-gradient-to-br from-black via-black to-neutral-950 pb-28 lg:pb-36">
							{children}
						</div>
					</TransitionViewport>
					<SiteFooter locale={locale} />
				</div>
				<SiteDock />
			</TransitionProvider>
		</NextIntlClientProvider>
	);
}

function LocaleLayoutShell() {
	return (
		<div className="app-shell flex min-h-screen flex-col">
			<div className="app-gradient min-h-full bg-gradient-to-br from-black via-black to-neutral-950" />
		</div>
	);
}
