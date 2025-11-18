import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import SimplePage from "@/components/simple-page";
import WorkspacePageShell from "@/components/workspace-page-shell";

const operators = [
	{ name: "Mina Park", roleKey: "admin", statusKey: "active" },
	{ name: "Leo Martinez", roleKey: "supervisor", statusKey: "active" },
	{ name: "Eli Choi", roleKey: "agent", statusKey: "invited" },
	{ name: "Addison Fox", roleKey: "agent", statusKey: "suspended" },
] as const;

type PageProps = {
	params: Promise<{ locale: string }>;
};

export async function generateMetadata({
	params,
}: PageProps): Promise<Metadata> {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "AdminUsers" });
	return {
		title: t("metadata.title"),
	};
}

export default function AdminUsersPage(props: PageProps) {
	return (
		<Suspense fallback={<WorkspacePageShell lines={operators.length + 2} />}>
			<AdminUsersContent {...props} />
		</Suspense>
	);
}

async function AdminUsersContent({ params }: PageProps) {
	const { locale } = await params;
	const t = await getTranslations({ locale, namespace: "AdminUsers" });

	return (
		<SimplePage title={t("title")} description={t("description")}>
			<table className="w-full border-separate border-spacing-y-3 text-sm text-white/70">
				<thead>
					<tr className="text-left text-xs uppercase tracking-[0.3em] text-white/40">
						<th className="px-3">{t("table.name")}</th>
						<th className="px-3">{t("table.role")}</th>
						<th className="px-3">{t("table.status")}</th>
					</tr>
				</thead>
				<tbody>
					{operators.map((operator) => (
						<tr
							key={operator.name}
							className="rounded-2xl border border-white/10 bg-white/[0.03]"
						>
							<td className="rounded-l-2xl px-3 py-3 text-white">
								{operator.name}
							</td>
							<td className="px-3 py-3">{t(`roles.${operator.roleKey}`)}</td>
							<td className="rounded-r-2xl px-3 py-3">
								{t(`statuses.${operator.statusKey}`)}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</SimplePage>
	);
}
