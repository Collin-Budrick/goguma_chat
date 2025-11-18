import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import AuthForm from "@/components/auth-form";
import GradientText from "@/components/gradient-text";
import MarketingPageShell from "@/components/marketing-page-shell";
import { Link } from "@/i18n/navigation";

type PageProps = {
	params: Promise<{ locale: string }>;
};

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Signup" });
	return {
		title: t("metadata.title"),
		description: t("metadata.description"),
	};
}

export default function SignupPage(props: PageProps) {
	return (
		<Suspense fallback={<MarketingPageShell sections={2} />}>
			<SignupPageContent {...props} />
		</Suspense>
	);
}

async function SignupPageContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "Signup" });

	return (
		<main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center px-6 py-16 pb-32 text-white">
			<div className="mb-8">
				<Link
					href="/"
					className="text-sm text-white/60 transition hover:text-white"
				>
					{t("backLink")}
				</Link>
			</div>
			<div className="rounded-3xl border border-white/10 bg-white/[0.04] p-10 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
				<h1 className="text-2xl font-semibold tracking-tight">
					<GradientText className="block">{t("title")}</GradientText>
				</h1>
				<p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
				<div className="mt-8">
					<AuthForm mode="signup" />
				</div>
				<p className="mt-4 text-center text-xs text-white/50">
					{t.rich("terms", {
						terms: (chunks) => (
							<Link
								href="/terms"
								className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
							>
								{chunks}
							</Link>
						),
						privacy: (chunks) => (
							<Link
								href="/privacy"
								className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
							>
								{chunks}
							</Link>
						),
					})}
				</p>
				<p className="mt-6 text-center text-xs text-white/50">
					{t.rich("loginPrompt", {
						link: (chunks) => (
							<Link
								href="/login"
								className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
							>
								{chunks}
							</Link>
						),
					})}
				</p>
			</div>
		</main>
	);
}
