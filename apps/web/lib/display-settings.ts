"use client";

export type DisplayTheme = "dark" | "light";

export type DisplaySettings = {
	magnify: boolean;
	showLabels: boolean;
	theme: DisplayTheme;
};

const STORAGE_KEY = "site-dock-display";
export const DISPLAY_SETTINGS_EVENT = "site-dock-display-change";

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
	magnify: true,
	showLabels: true,
	theme: "dark",
};

const isLightTheme = (value: unknown): value is DisplayTheme =>
	value === "light" ? true : value === "dark" ? true : false;

export function loadDisplaySettings(): DisplaySettings {
	if (typeof window === "undefined") {
		return DEFAULT_DISPLAY_SETTINGS;
	}

	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_DISPLAY_SETTINGS;
		const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
		return {
			...DEFAULT_DISPLAY_SETTINGS,
			...parsed,
			theme: isLightTheme(parsed.theme)
				? parsed.theme
				: DEFAULT_DISPLAY_SETTINGS.theme,
		};
	} catch {
		return DEFAULT_DISPLAY_SETTINGS;
	}
}

export function persistDisplaySettings(settings: DisplaySettings) {
	if (typeof window === "undefined") return;

	try {
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// ignore storage issues
	}

	const event = new CustomEvent(DISPLAY_SETTINGS_EVENT, {
		detail: settings,
	});
	// Dispatch asynchronously to avoid triggering sync React updates during render
	window.setTimeout(() => window.dispatchEvent(event), 0);
}
