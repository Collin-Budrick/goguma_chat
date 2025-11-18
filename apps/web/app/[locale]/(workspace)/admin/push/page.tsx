import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import SimplePage from "@/components/simple-page";
import WorkspacePageShell from "@/components/workspace-page-shell";

type PageProps = {
	params: Promise<{ locale: string }>;
};

const audienceKeys = ["all", "enterprise", "sandbox", "custom"] as const;

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "AdminPush" });
	return {
		title: t("metadata.title"),
	};
}

export default function AdminPushPage(props: PageProps) {
	return (
		<Suspense fallback={<WorkspacePageShell lines={5} />}>
			<AdminPushContent {...props} />
		</Suspense>
	);
}

async function AdminPushContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "AdminPush" });

	return (
		<SimplePage title={t("title")} description={t("description")}>
			<section className="space-y-4">
				<h2 className="text-sm font-semibold text-white">
					{t("targetHeading")}
				</h2>
				<ul className="grid gap-3 text-sm text-white/70">
					{audienceKeys.map((key) => (
						<li
							key={key}
							className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
						>
							{t(`audiences.${key}`)}
						</li>
					))}
				</ul>
			</section>
			<section className="space-y-3">
				<h2 className="text-sm font-semibold text-white">
					{t("composeHeading")}
				</h2>
				<textarea
					className="h-40 w-full resize-none rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
					placeholder={t("placeholder")}
				/>
				<div className="flex gap-3">
					<button
						type="button"
						className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
					>
						{t("actions.sendNow")}
					</button>
					<button
						type="button"
						className="rounded-full border border-white/20 px-4 py-2 text-xs text-white transition hover:border-white"
					>
						{t("actions.schedule")}
					</button>
				</div>
			</section>
		</SimplePage>
	);
}
