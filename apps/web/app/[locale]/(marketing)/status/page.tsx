import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";
import SimplePage from "@/components/simple-page";

type PageProps = {
	params: Promise<{ locale: string }>;
};

const serviceKeys = ["chatApi", "presence", "automation", "exports"] as const;

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Status" });
	return {
		title: t("metadata.title"),
		description: t("metadata.description"),
	};
}

export default function StatusPage(props: PageProps) {
	return (
		<Suspense fallback={<MarketingPageShell sections={serviceKeys.length} />}>
			<StatusPageContent {...props} />
		</Suspense>
	);
}

async function StatusPageContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Status" });

	return (
		<SimplePage title={t("title")} description={t("description")}>
			<ul className="space-y-4 text-sm">
				{serviceKeys.map((key) => (
					<li
						key={key}
						className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
					>
						<div className="flex items-center justify-between text-white">
							<span>{t(`services.${key}.name`)}</span>
							<span className="text-xs uppercase tracking-[0.3em] text-white/50">
								{t(`services.${key}.status`)}
							</span>
						</div>
						<p className="mt-2 text-xs text-white/60">
							{t(`services.${key}.note`)}
						</p>
					</li>
				))}
			</ul>
		</SimplePage>
	);
}
