"use client";

export type ChatLocalSettings = {
	showTypingIndicators: boolean;
};

export const DEFAULT_CHAT_LOCAL_SETTINGS: ChatLocalSettings = {
	showTypingIndicators: true,
};

type SettingsMap = Record<string, ChatLocalSettings>;

const STORAGE_KEY = "chat-thread-local-settings";

function readStore(): SettingsMap {
	if (typeof window === "undefined") {
		return {};
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) {
			return {};
		}

		const parsed = JSON.parse(raw) as Record<string, unknown>;
		if (!parsed || typeof parsed !== "object") {
			return {};
		}

		return Object.entries(parsed).reduce<SettingsMap>((acc, [key, value]) => {
			if (
				value &&
				typeof value === "object" &&
				"showTypingIndicators" in value
			) {
				const setting = value as Record<string, unknown>;
				if (typeof setting.showTypingIndicators === "boolean") {
					acc[key] = {
						showTypingIndicators: setting.showTypingIndicators,
					};
				}
			}
			return acc;
		}, {});
	} catch {
		return {};
	}
}

function writeStore(map: SettingsMap) {
	if (typeof window === "undefined") {
		return;
	}

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
	} catch {
		// Ignore storage errors to keep UX smooth
	}
}

export function loadChatLocalSettings(
	conversationId: string | null,
): ChatLocalSettings {
	if (!conversationId) {
		return DEFAULT_CHAT_LOCAL_SETTINGS;
	}

	const store = readStore();
	return store[conversationId] ?? DEFAULT_CHAT_LOCAL_SETTINGS;
}

export function persistChatLocalSettings(
	conversationId: string,
	settings: ChatLocalSettings,
) {
	if (!conversationId) {
		return;
	}

	const store = readStore();
	store[conversationId] = settings;
	writeStore(store);
}
