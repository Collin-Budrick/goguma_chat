type MarketingPageShellProps = {
	sections?: number;
	itemsPerSection?: number;
};

const DEFAULT_SECTIONS = 3;
const DEFAULT_ITEMS = 3;

export default function MarketingPageShell({
	sections = DEFAULT_SECTIONS,
	itemsPerSection = DEFAULT_ITEMS,
}: MarketingPageShellProps) {
	const sectionsArray = Array.from({ length: sections }, (_, sectionIndex) => ({
		id: `marketing-shell-section-${sectionIndex}`,
		items: Array.from({ length: itemsPerSection }, (_, itemIndex) =>
			`marketing-shell-section-${sectionIndex}-item-${itemIndex}`,
		),
	}));

	return (
		<div className="mx-auto max-w-5xl space-y-6 rounded-3xl border border-white/10 bg-white/[0.02] p-8">
			<div className="space-y-3">
				<div className="h-8 w-2/3 rounded-full bg-white/[0.08]" />
				<div className="h-4 w-11/12 rounded-full bg-white/[0.08]" />
				<div className="h-4 w-5/6 rounded-full bg-white/[0.08]" />
			</div>
			<div className="space-y-4 pt-2">
				{sectionsArray.map((section) => (
					<div
						key={section.id}
						className="rounded-2xl border border-white/10 bg-black/40 p-4"
					>
						<div className="h-5 w-1/3 rounded-full bg-white/[0.08]" />
						<div className="mt-3 space-y-2">
							{section.items.map((itemId) => (
								<div
									key={itemId}
									className="h-3 w-full rounded-full bg-white/[0.08]"
								/>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
