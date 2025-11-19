import type { PropsWithChildren } from "react";
import { Suspense } from "react";

import ProtectedApp from "./protected-app";

export const metadata = {
	title: "Workspace | Goguma Chat",
};

export default function AppLayout({ children }: PropsWithChildren) {
	return (
		<Suspense fallback={<AppLayoutShell />}>
			<ProtectedApp>{children}</ProtectedApp>
		</Suspense>
	);
}

function AppLayoutShell() {
	return (
		<div className="mx-auto flex h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col gap-10 px-6 py-16 pb-32 overflow-hidden">
			<div className="flex flex-1 min-h-0 h-full">
				<div className="flex-1 rounded-3xl border border-white/10 bg-white/[0.02]" />
			</div>
		</div>
	);
}
