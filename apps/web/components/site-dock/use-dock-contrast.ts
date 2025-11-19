"use client";

import type { RefObject } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";

export type ContrastTheme = "light" | "dark";

export type RGBColor = {
	r: number;
	g: number;
	b: number;
	a: number;
};

export const parseRGBColor = (value: string): RGBColor | null => {
	const match = value.match(/rgba?\(([^)]+)\)/i);
	if (!match) return null;
	const parts = match[1].split(",").map((part) => part.trim());
	if (parts.length < 3) return null;
	const toChannel = (channel: string) => {
		if (channel.endsWith("%")) {
			const numeric = Number.parseFloat(channel);
			return Number.isNaN(numeric) ? 0 : (numeric / 100) * 255;
		}
		const numeric = Number.parseFloat(channel);
		return Number.isNaN(numeric) ? 0 : numeric;
	};
	const [r, g, b, alpha] = parts;
	return {
		r: Math.min(255, Math.max(0, toChannel(r))),
		g: Math.min(255, Math.max(0, toChannel(g))),
		b: Math.min(255, Math.max(0, toChannel(b))),
		a:
			alpha !== undefined
				? Math.min(1, Math.max(0, Number.parseFloat(alpha)))
				: 1,
	};
};

export const relativeLuminance = (color: RGBColor) => {
	const channel = (value: number) => {
		const normalized = value / 255;
		return normalized <= 0.03928
			? normalized / 12.92
			: ((normalized + 0.055) / 1.055) ** 2.4;
	};
	const r = channel(color.r);
	const g = channel(color.g);
	const b = channel(color.b);
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

export const getEffectiveBackgroundColor = (
	node: Element | null,
): RGBColor | null => {
	if (typeof window === "undefined" || typeof document === "undefined")
		return null;
	let current: Element | null = node;
	while (current && current instanceof HTMLElement) {
		const computed = window.getComputedStyle(current);
		const parsed = parseRGBColor(computed.backgroundColor);
		if (parsed && parsed.a > 0.05) {
			return parsed;
		}
		current = current.parentElement;
	}
	const bodyColor = window.getComputedStyle(document.body).backgroundColor;
	return parseRGBColor(bodyColor);
};

export type ContrastSampler = {
	subscribe: (listener: () => void) => () => void;
	getSnapshot: () => ContrastTheme;
	getServerSnapshot: () => ContrastTheme;
	setEnabled: (value: boolean) => void;
};

export const createContrastSampler = (
	ref: RefObject<HTMLElement | null>,
): ContrastSampler => {
	const listeners = new Set<() => void>();
	const events: Array<keyof WindowEventMap> = [
		"scroll",
		"resize",
		"pointermove",
	];
	let tone: ContrastTheme = "dark";
	let enabled = false;
	let frame: number | null = null;
	const luminanceSamples: number[] = [];
	const getSmoothedLuminance = (value: number) => {
		luminanceSamples.push(value);
		if (luminanceSamples.length > 5) {
			luminanceSamples.shift();
		}
		return (
			luminanceSamples.reduce((total, sample) => total + sample, 0) /
			luminanceSamples.length
		);
	};
	const BRIGHT_BACKGROUND_THRESHOLD = 0.62;
	const DARK_BACKGROUND_THRESHOLD = 0.48;

	const notify = () => {
		listeners.forEach((listener) => {
			listener();
		});
	};

	const getUnderlayColor = (x: number, y: number): RGBColor | null => {
		const targetElement = ref.current;
		const isDockElement = (element: HTMLElement | null) => {
			if (!element || !targetElement) return false;
			return (
				element === targetElement ||
				targetElement.contains(element) ||
				element.contains(targetElement)
			);
		};

		if (typeof document.elementsFromPoint === "function") {
			const elements = document.elementsFromPoint(x, y) as HTMLElement[];
			const underneath = elements.find((element) => !isDockElement(element));
			if (underneath) {
				return getEffectiveBackgroundColor(underneath);
			}
		}

		if (!targetElement) {
			const fallback = document.elementFromPoint(x, y) as HTMLElement | null;
			return getEffectiveBackgroundColor(fallback ?? document.body);
		}

		const previousPointerEvents = targetElement.style.pointerEvents;
		targetElement.style.pointerEvents = "none";
		let underneath: HTMLElement | null = null;
		try {
			underneath = document.elementFromPoint(x, y) as HTMLElement | null;
			if (underneath && isDockElement(underneath)) {
				underneath = null;
			}
		} finally {
			targetElement.style.pointerEvents = previousPointerEvents;
		}

		return getEffectiveBackgroundColor(underneath ?? document.body);
	};

	const sample = () => {
		frame = null;
		if (!enabled) return;
		if (typeof window === "undefined" || typeof document === "undefined")
			return;
		const targetElement = ref.current;
		if (!targetElement) return;
		const rect = targetElement.getBoundingClientRect();
		const centerX = rect.left + rect.width / 2;
		const centerY = rect.top + rect.height / 2;
		if (
			centerX < 0 ||
			centerY < 0 ||
			centerX > window.innerWidth ||
			centerY > window.innerHeight
		) {
			return;
		}

		const clamp = (value: number, min: number, max: number) =>
			Math.min(max, Math.max(min, value));
		const samplePoints: Array<[number, number]> = [
			[centerX, centerY],
			[
				centerX,
				clamp(rect.bottom - rect.height / 4, 0, window.innerHeight - 1),
			],
			[centerX, clamp(rect.top + rect.height / 4, 0, window.innerHeight - 1)],
		];

		const colors = samplePoints
			.map(([x, y]) => getUnderlayColor(x, y))
			.filter((color): color is RGBColor => Boolean(color));

		if (colors.length === 0) return;

		const luminance =
			colors.reduce((total, color) => total + relativeLuminance(color), 0) /
			colors.length;
		const smoothedLuminance = getSmoothedLuminance(luminance);

		let nextTone: ContrastTheme = tone;
		if (tone === "light" && smoothedLuminance >= BRIGHT_BACKGROUND_THRESHOLD) {
			nextTone = "dark";
		} else if (
			tone === "dark" &&
			smoothedLuminance <= DARK_BACKGROUND_THRESHOLD
		) {
			nextTone = "light";
		}

		if (nextTone !== tone) {
			tone = nextTone;
			notify();
		}
	};

	const schedule = () => {
		if (!enabled) return;
		if (typeof window === "undefined") return;
		if (frame !== null) return;
		frame = window.requestAnimationFrame(sample);
	};

	const attach = () => {
		if (typeof window === "undefined" || typeof document === "undefined")
			return;
		events.forEach((event) => {
			window.addEventListener(event, schedule, { passive: true });
		});
		document.addEventListener("scroll", schedule, {
			passive: true,
			capture: true,
		});
		schedule();
	};

	const detach = () => {
		if (typeof window === "undefined" || typeof document === "undefined")
			return;
		events.forEach((event) => {
			window.removeEventListener(event, schedule);
		});
		document.removeEventListener("scroll", schedule, { capture: true });
		if (frame !== null) {
			window.cancelAnimationFrame(frame);
			frame = null;
		}
	};

	return {
		subscribe(listener) {
			listeners.add(listener);
			if (listeners.size === 1 && enabled) {
				attach();
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size === 0) {
					detach();
				}
			};
		},
		getSnapshot() {
			return enabled ? tone : "light";
		},
		getServerSnapshot() {
			return "dark";
		},
		setEnabled(value: boolean) {
			if (enabled === value) return;
			enabled = value;
			if (listeners.size === 0) return;
			if (enabled) {
				attach();
			} else {
				detach();
			}
		},
	};
};

export function useDockContrast(
	ref: RefObject<HTMLElement | null>,
): ContrastTheme {
	const [sampler] = useState(() => createContrastSampler(ref));

	useEffect(() => {
		sampler.setEnabled(true);
		return () => {
			sampler.setEnabled(false);
		};
	}, [sampler]);

	return useSyncExternalStore(
		sampler.subscribe,
		sampler.getSnapshot,
		sampler.getServerSnapshot,
	);
}
