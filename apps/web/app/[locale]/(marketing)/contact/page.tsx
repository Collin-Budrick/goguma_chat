import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";
import SimplePage from "@/components/simple-page";

type PageProps = {
	params: Promise<{ locale: string }>;
};

const channelKeys = ["email", "signal", "community"] as const;

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Contact" });
	return {
		title: t("metadata.title"),
		description: t("metadata.description"),
	};
}

export default function ContactPage(props: PageProps) {
	return (
		<Suspense fallback={<MarketingPageShell sections={channelKeys.length} />}>
			<ContactPageContent {...props} />
		</Suspense>
	);
}

async function ContactPageContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Contact" });

	return (
		<SimplePage title={t("title")} description={t("description")}>
			<p>{t("intro")}</p>
			<dl className="grid gap-6 text-sm">
				{channelKeys.map((key) => (
					<div key={key}>
						<dt className="text-white">{t(`channels.${key}.label`)}</dt>
						<dd className="text-white/70">
							<div>{t(`channels.${key}.value`)}</div>
							<div className="text-xs text-white/50">
								{t(`channels.${key}.description`)}
							</div>
						</dd>
					</div>
				))}
			</dl>
		</SimplePage>
	);
}
