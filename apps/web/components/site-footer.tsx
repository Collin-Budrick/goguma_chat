import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

const footerLinks = [
	{ href: "/privacy", labelKey: "links.privacy" },
	{ href: "/terms", labelKey: "links.terms" },
	{ href: "/status", labelKey: "links.status" },
	{ href: "/support", labelKey: "links.support" },
];

export default async function SiteFooter({ locale }: { locale: string }) {
	const t = await getTranslations({ locale, namespace: "Shell.footer" });
	const year = new Date().getFullYear();

	return (
		<footer className="border-t border-white/10 bg-black/80">
			<div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-10 pb-24 text-sm text-white/60 sm:flex-row sm:items-center sm:justify-between">
				<p className="text-white/50">{t("copy", { year })}</p>
				<nav className="flex flex-wrap items-center gap-4">
					{footerLinks.map((item) => (
						<Link
							key={item.href}
							href={item.href}
							className="transition hover:text-white"
						>
							{t(item.labelKey)}
						</Link>
					))}
				</nav>
			</div>
		</footer>
	);
}
