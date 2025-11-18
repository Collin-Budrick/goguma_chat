"use client";

import {
	DEFAULT_MESSAGING_MODE,
	isMessagingMode,
	type MessagingMode,
} from "./messaging-mode-shared";

const STORAGE_KEY = "site-messaging-mode";
export const MESSAGING_MODE_EVENT = "site-messaging-mode-change";

export { DEFAULT_MESSAGING_MODE, isMessagingMode };
export type { MessagingMode };

export function loadMessagingMode(): MessagingMode {
	if (typeof window === "undefined") {
		return DEFAULT_MESSAGING_MODE;
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_MESSAGING_MODE;
		return isMessagingMode(raw) ? raw : DEFAULT_MESSAGING_MODE;
	} catch {
		return DEFAULT_MESSAGING_MODE;
	}
}

export function persistMessagingMode(mode: MessagingMode) {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(STORAGE_KEY, mode);
	} catch {
		// ignore storage failures
	}

	const event = new CustomEvent<MessagingMode>(MESSAGING_MODE_EVENT, {
		detail: mode,
	});

	window.setTimeout(() => window.dispatchEvent(event), 0);
}
