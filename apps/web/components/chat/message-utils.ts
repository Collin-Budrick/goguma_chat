export type SortableMessage = {
	id: string;
	createdAt: string;
};

export function toDate(value: string) {
	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function mergeMessages<T extends SortableMessage>(
	existing: T[],
	incoming: T[],
): T[] {
	const seen = new Map(existing.map((message) => [message.id, message]));
	for (const message of incoming) {
		seen.set(message.id, message);
	}
	return Array.from(seen.values()).sort(
		(a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
	);
}
