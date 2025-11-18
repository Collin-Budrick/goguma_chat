import type { PropsWithChildren } from "react";
import { Suspense } from "react";

export default function MarketingLayout({ children }: PropsWithChildren) {
	return <Suspense fallback={<MarketingLayoutFallback />}>{children}</Suspense>;
}

const MARKETING_FALLBACK_KEYS = ["row-a", "row-b", "row-c", "row-d"] as const;

function MarketingLayoutFallback() {
	return (
		<div className="mx-auto max-w-5xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8">
			<div className="h-8 w-2/3 rounded-full bg-white/[0.08]" />
			<div className="space-y-3">
				<div className="h-4 w-full rounded-full bg-white/[0.08]" />
				<div className="h-4 w-11/12 rounded-full bg-white/[0.08]" />
				<div className="h-4 w-5/6 rounded-full bg-white/[0.08]" />
			</div>
			<div className="space-y-4 pt-4">
				{MARKETING_FALLBACK_KEYS.map((key) => (
					<div
						key={key}
						className="rounded-2xl border border-white/10 bg-black/40 p-4"
					>
						<div className="h-5 w-1/3 rounded-full bg-white/[0.08]" />
						<div className="mt-3 space-y-2">
							<div className="h-3 w-full rounded-full bg-white/[0.08]" />
							<div className="h-3 w-4/5 rounded-full bg-white/[0.08]" />
							<div className="h-3 w-3/5 rounded-full bg-white/[0.08]" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
