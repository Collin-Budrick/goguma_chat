import type { ComponentType } from "react";
import {
	CircleUserRound,
	Home,
	Layers,
	LayoutDashboard,
	Megaphone,
	MessageSquare,
	Settings2,
	Users,
} from "lucide-react";

export type DockLinkItem = {
	type: "link";
	href: string;
	label: string;
	icon: ComponentType<{ className?: string }>;
	match?: (path: string) => boolean;
	indicator?: boolean | number;
};

export type DockActionItem = {
	type: "action";
	id: "preferences";
	label: string;
	icon: ComponentType<{ className?: string }>;
	indicator?: boolean | number;
};

export type DockNavItem = DockLinkItem | DockActionItem;

export type DockLinkDefinition = Omit<DockLinkItem, "label"> & {
	labelKey: string;
};

export type DockActionDefinition = Omit<DockActionItem, "label"> & {
	labelKey: string;
};

export type DockNavDefinition = DockLinkDefinition | DockActionDefinition;

export function isLinkItem(item: DockNavItem): item is DockLinkItem {
	return item.type === "link";
}

export const marketingDock: DockNavDefinition[] = [
	{
		type: "link",
		href: "/",
		labelKey: "nav.marketing.home",
		icon: Home,
		match: (path) => path === "/",
	},
	{
		type: "link",
		href: "/login",
		labelKey: "nav.marketing.account",
		icon: CircleUserRound,
		match: (path) => path.startsWith("/login") || path.startsWith("/signup"),
	},
	{
		type: "action",
		id: "preferences",
		labelKey: "nav.shared.display",
		icon: Settings2,
	},
];

export const appDock: DockNavDefinition[] = [
	{
		type: "link",
		href: "/app/dashboard",
		labelKey: "nav.app.overview",
		icon: LayoutDashboard,
	},
	{
		type: "link",
		href: "/app/chat",
		labelKey: "nav.app.chats",
		icon: MessageSquare,
	},
	{
		type: "link",
		href: "/app/contacts",
		labelKey: "nav.app.contacts",
		icon: Users,
	},
	{
		type: "link",
		href: "/app/settings",
		labelKey: "nav.app.settings",
		icon: Settings2,
	},
	{
		type: "link",
		href: "/profile",
		labelKey: "nav.app.profile",
		icon: CircleUserRound,
	},
];

export const adminDock: DockNavDefinition[] = [
	{
		type: "link",
		href: "/admin",
		labelKey: "nav.admin.console",
		icon: LayoutDashboard,
	},
	{
		type: "link",
		href: "/admin/push",
		labelKey: "nav.admin.broadcasts",
		icon: Megaphone,
	},
	{
		type: "link",
		href: "/admin/users",
		labelKey: "nav.admin.roster",
		icon: Layers,
	},
];

export function resolveDock(
	pathname: string,
	resolveLabel: (key: string) => string,
): DockNavItem[] {
	const hydrate = (items: DockNavDefinition[]) =>
		items.map((item) => ({
			...item,
			label: resolveLabel(item.labelKey),
		}));

	if (pathname.startsWith("/admin")) return hydrate(adminDock);
	if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
		return hydrate(appDock);
	}
	return hydrate(marketingDock);
}
