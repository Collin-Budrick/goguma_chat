type WorkspacePageShellProps = {
	lines?: number;
};

const DEFAULT_LINES = 4;

export default function WorkspacePageShell({
	lines = DEFAULT_LINES,
}: WorkspacePageShellProps) {
	const linesArray = Array.from({ length: lines }, (_, index) => `workspace-shell-line-${index}`);
	return (
		<div className="mx-auto w-full max-w-4xl space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-8">
			<div className="h-8 w-1/2 rounded-full bg-white/[0.08]" />
			<div className="space-y-2">
				{linesArray.map((lineId) => (
					<div
						key={lineId}
						className="h-4 w-full rounded-full bg-white/[0.08]"
					/>
				))}
			</div>
		</div>
	);
}
