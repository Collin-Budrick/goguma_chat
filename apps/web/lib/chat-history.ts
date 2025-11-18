"use client";

export const CHAT_HISTORY_EVENT = "chat-thread:history-cleared";

export type ChatHistoryEventDetail = {
	conversationId: string;
	clearedAt: string | null;
};

type ClearMap = Record<string, string>;

const STORAGE_KEY = "chat-thread-clears";

function readStore(): ClearMap {
	if (typeof window === "undefined") {
		return {};
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}
		const parsed = JSON.parse(raw) as unknown;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}

		return Object.entries(parsed as Record<string, unknown>).reduce<ClearMap>(
			(acc, [conversationId, value]) => {
				if (typeof value === "string" && value.length > 0) {
					acc[conversationId] = value;
				}
				return acc;
			},
			{},
		);
	} catch {
		return {};
	}
}

function writeStore(map: ClearMap) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// ignore storage errors to keep UX smooth
	}
}

function dispatchHistoryEvent(detail: ChatHistoryEventDetail) {
	if (typeof window === "undefined") {
		return;
	}

	const event = new CustomEvent<ChatHistoryEventDetail>(CHAT_HISTORY_EVENT, {
		detail,
	});
	window.setTimeout(() => window.dispatchEvent(event), 0);
}

export function getConversationClearedAt(
	conversationId: string,
): string | null {
	if (!conversationId) {
		return null;
	}
	const store = readStore();
	return store[conversationId] ?? null;
}

export function persistConversationClearedAt(
	conversationId: string,
): string | null {
	if (!conversationId) {
		return null;
	}

	const timestamp = new Date().toISOString();
	const store = readStore();
	store[conversationId] = timestamp;
	writeStore(store);
	dispatchHistoryEvent({ conversationId, clearedAt: timestamp });
	return timestamp;
}

export function removeConversationClear(conversationId: string) {
	if (!conversationId) {
		return;
	}

	const store = readStore();
	if (!(conversationId in store)) {
		return;
	}

	delete store[conversationId];
	writeStore(store);
	dispatchHistoryEvent({ conversationId, clearedAt: null });
}
