const CHAT_SIDEBAR_SKELETON_ROWS = Array.from(
	{ length: 6 },
	(_, index) => `contact-row-${index}`,
);

const CHAT_BODY_SKELETON_ROWS = Array.from(
	{ length: 5 },
	(_, index) => `message-row-${index}`,
);

export default function ChatPageShell() {
	return (
		<div className="grid h-full min-h-[28rem] gap-6 lg:grid-cols-[320px,1fr]">
			<div className="space-y-4 rounded-3xl border border-white/10 bg-white/[0.02] p-4">
				<div className="h-6 w-3/4 rounded-full bg-white/[0.08]" />
				<div className="space-y-3">
					{CHAT_SIDEBAR_SKELETON_ROWS.map((id) => (
						<div
							key={id}
							className="h-12 rounded-2xl border border-white/10 bg-black/40"
						/>
					))}
				</div>
			</div>
			<div className="rounded-3xl border border-white/10 bg-black/60 p-6">
				<div className="h-6 w-1/3 rounded-full bg-white/[0.08]" />
				<div className="mt-4 space-y-4">
					{CHAT_BODY_SKELETON_ROWS.map((id) => (
						<div key={id} className="h-4 w-full rounded-full bg-white/[0.08]" />
					))}
				</div>
			</div>
		</div>
	);
}
