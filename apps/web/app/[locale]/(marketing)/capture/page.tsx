import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";

type PageProps = {
	params: Promise<{ locale: string }>;
};

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Capture" });
	return {
		title: t("metadata.title"),
		description: t("metadata.description"),
	};
}

export default function CapturePage(props: PageProps) {
	return (
		<Suspense
			fallback={<MarketingPageShell sections={1} itemsPerSection={1} />}
		>
			<CapturePageContent {...props} />
		</Suspense>
	);
}

async function CapturePageContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Capture" });

	return (
		<div
			aria-hidden="true"
			className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-white/5 via-white/0 to-white/10"
		>
			<div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.18)_0%,transparent_60%)]" />
			<span className="sr-only">{t("srText")}</span>
		</div>
	);
}
