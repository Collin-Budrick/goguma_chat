"use client";

import {
	startTransition,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransitionDirection } from "./transition-context";
import { DockItem } from "./site-dock/dock-item";
import {
	isLinkItem,
	resolveDock,
	type DockNavItem,
} from "./site-dock/navigation";
import { FlipWords } from "@/components/ui/flip-words";
import { type Locale } from "@/i18n/routing";
import { PreferencesPopover } from "./site-dock/preferences-popover";
import { useBodyLightTheme } from "./site-dock/use-body-light-theme";
import {
	useDockContrast,
	type ContrastTheme,
} from "./site-dock/use-dock-contrast";
import { useDockMounted } from "./site-dock/use-dock-mounted";
import { useDockScrollState } from "./site-dock/use-dock-scroll-state";
import { usePreferencePanel } from "./site-dock/use-preference-panel";
import { useDockDisplaySettings } from "./site-dock/use-dock-display-settings";
import { useDockHoverAnimation } from "./site-dock/use-dock-hover";

const springConfig = { mass: 0.15, stiffness: 180, damping: 16 };

const LOCALE_TRANSITION_STORAGE_KEY = "site-locale-transition";

type LocaleTransitionPayload = {
	locale?: Locale;
	words?: string[];
	timestamp?: number;
};

type IndicatorEventPayload = {
	scope?: "chat" | "contacts" | "all";
	reason?: string;
	conversationId?: string | null;
	requestId?: string | null;
};

const getStoredLocaleTransition = (): {
	locale: Locale | null;
	words: string[] | null;
} | null => {
	if (typeof window === "undefined") return null;
	const raw = window.sessionStorage.getItem(LOCALE_TRANSITION_STORAGE_KEY);
	if (!raw) return null;
	window.sessionStorage.removeItem(LOCALE_TRANSITION_STORAGE_KEY);
	try {
		const parsed = JSON.parse(raw) as LocaleTransitionPayload;
		if (!parsed.locale || !parsed.words || parsed.words.length === 0)
			return null;
		if (!parsed.timestamp || Date.now() - parsed.timestamp > 2000) return null;
		return { locale: parsed.locale, words: parsed.words };
	} catch {
		return null;
	}
};

const localeDisplayNames: Record<Locale, string> = {
	en: "English",
	ko: "한국어",
};

function LocaleFlipOverlay({
	words,
	theme,
	onComplete,
	ariaLabel,
}: {
	words: string[];
	theme: ContrastTheme;
	onComplete: () => void;
	ariaLabel: string;
}) {
	const isLight = theme === "light";
	const surfaceClasses = isLight
		? "bg-white/85 text-slate-900"
		: "bg-black/85 text-white";

	return (
		<motion.div
			key="locale-flip-overlay"
			initial={{ opacity: 1 }}
			animate={{ opacity: 1 }}
			exit={{ opacity: 0 }}
			transition={{ duration: 0.25 }}
			className={`fixed inset-0 z-[120] flex items-center justify-center backdrop-blur-3xl ${surfaceClasses}`}
			aria-live="assertive"
			aria-label={ariaLabel}
		>
			<FlipWords
				words={words}
				loop={false}
				duration={900}
				className="text-4xl font-semibold uppercase tracking-[0.3em]"
				onCycleComplete={onComplete}
			/>
		</motion.div>
	);
}

export default function SiteDock() {
	const pathname = usePathname();
	const router = useRouter();
	const locale = useLocale() as Locale;
	const dockT = useTranslations("Shell.dock");
	const baseDockItems = useMemo(
		() => resolveDock(pathname, (key) => dockT(key)),
		[pathname, dockT],
	);
	const [indicatorState, setIndicatorState] = useState({
		chat: false,
		contacts: false,
	});
	const indicatorFetchControllerRef = useRef<AbortController | null>(null);
	const indicatorsInitializedRef = useRef(false);
	const activeConversationIdRef = useRef<string | null>(null);
	const shouldHydrateAppIndicators = useMemo(
		() =>
			baseDockItems.some(
				(item) =>
					isLinkItem(item) &&
					(item.href === "/app/chat" || item.href === "/app/contacts"),
			),
		[baseDockItems],
	);
	const isChatPath = pathname.startsWith("/app/chat");
	const isContactsPath = pathname.startsWith("/app/contacts");
	const isChatPathRef = useRef(isChatPath);
	const dockItems = useMemo(() => {
		if (!shouldHydrateAppIndicators) {
			return baseDockItems;
		}
		return baseDockItems.map((item) => {
			if (!isLinkItem(item)) {
				return item;
			}
			if (item.href === "/app/chat") {
				return { ...item, indicator: indicatorState.chat };
			}
			if (item.href === "/app/contacts") {
				return { ...item, indicator: indicatorState.contacts };
			}
			return item;
		});
	}, [baseDockItems, indicatorState, shouldHydrateAppIndicators]);
	useEffect(() => {
		isChatPathRef.current = isChatPath;
	}, [isChatPath]);
	const scrolled = useDockScrollState();
	const mounted = useDockMounted();
	const refreshDockIndicators = useCallback(async () => {
		if (!mounted || !shouldHydrateAppIndicators) {
			return;
		}

		indicatorFetchControllerRef.current?.abort();
		const controller = new AbortController();
		indicatorFetchControllerRef.current = controller;

		let aborted = false;
		let nextContacts = false;
		let nextChat = false;

		const checkAbort = () => {
			if (controller.signal.aborted) {
				aborted = true;
			}
			return aborted;
		};

		try {
			try {
				const response = await fetch("/api/friend-requests", {
					method: "GET",
					signal: controller.signal,
					credentials: "include",
				});

				if (response.ok) {
					const data = (await response.json().catch(() => ({}))) as {
						incoming?: unknown;
					};
					const incoming = Array.isArray(data?.incoming) ? data.incoming : [];
					nextContacts = incoming.length > 0;
				} else if (response.status !== 401 && !checkAbort()) {
					console.error(
						"Failed to load friend requests for dock",
						response.statusText,
					);
				}
			} catch (error) {
				if (checkAbort()) {
					return;
				}
				console.error("Failed to load friend requests for dock", error);
			}

			try {
				const shouldExclude =
					Boolean(activeConversationIdRef.current) && isChatPathRef.current;
				const unreadParams = new URLSearchParams();
				if (shouldExclude && activeConversationIdRef.current) {
					unreadParams.set("exclude", activeConversationIdRef.current);
				}
				const unreadUrl =
					unreadParams.size > 0
						? `/api/conversations/unread?${unreadParams.toString()}`
						: "/api/conversations/unread";

				const response = await fetch(unreadUrl, {
					method: "GET",
					signal: controller.signal,
					credentials: "include",
				});

				if (response.ok) {
					const data = (await response.json().catch(() => ({}))) as {
						total?: unknown;
						conversations?: Array<{ unreadCount?: unknown }>;
					};

					if (typeof data?.total === "number" && Number.isFinite(data.total)) {
						nextChat = data.total > 0;
					} else if (Array.isArray(data?.conversations)) {
						nextChat = data.conversations.some((conversation) => {
							const count = Number(conversation?.unreadCount ?? 0);
							return Number.isFinite(count) && count > 0;
						});
					} else {
						nextChat = false;
					}
				} else if (response.status !== 401 && !checkAbort()) {
					console.error(
						"Failed to load unread conversations for dock",
						response.statusText,
					);
				}
			} catch (error) {
				if (checkAbort()) {
					return;
				}
				console.error("Failed to load unread conversations for dock", error);
			}

			if (checkAbort()) {
				return;
			}

			setIndicatorState((prev) => {
				if (prev.chat === nextChat && prev.contacts === nextContacts) {
					return prev;
				}
				return { chat: nextChat, contacts: nextContacts };
			});
		} finally {
			if (indicatorFetchControllerRef.current === controller) {
				indicatorFetchControllerRef.current = null;
			}
			if (!aborted) {
				indicatorsInitializedRef.current = true;
			}
		}
	}, [mounted, shouldHydrateAppIndicators]);
	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handler = (event: Event) => {
			if (!("detail" in event)) {
				activeConversationIdRef.current = null;
				return;
			}
			const detail = (event as CustomEvent<{ conversationId?: string | null }>)
				.detail;
			if (detail && typeof detail.conversationId === "string") {
				activeConversationIdRef.current = detail.conversationId;
			} else {
				activeConversationIdRef.current = null;
			}
		};

		window.addEventListener("dock:active-conversation", handler);

		return () => {
			window.removeEventListener("dock:active-conversation", handler);
		};
	}, []);
	useEffect(() => {
		return () => {
			indicatorFetchControllerRef.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (!mounted || !shouldHydrateAppIndicators) {
			return;
		}

		refreshDockIndicators();
	}, [mounted, shouldHydrateAppIndicators, refreshDockIndicators]);
	useEffect(() => {
		if (!shouldHydrateAppIndicators) {
			return;
		}

		if (typeof window === "undefined") {
			return;
		}

		const handler = (event: Event) => {
			const detail =
				"detail" in event
					? (event as CustomEvent<{ scope?: "chat" | "contacts" | "all" }>)
							.detail
					: undefined;
			const scope = detail?.scope ?? "all";
			if (scope !== "all" && scope !== "chat") {
				return;
			}
			refreshDockIndicators();
		};

		window.addEventListener("dock:refresh-indicators", handler);

		return () => {
			window.removeEventListener("dock:refresh-indicators", handler);
		};
	}, [shouldHydrateAppIndicators, refreshDockIndicators]);
	useEffect(() => {
		if (!mounted || !shouldHydrateAppIndicators) {
			return;
		}

		if (
			typeof window === "undefined" ||
			typeof window.EventSource === "undefined"
		) {
			return;
		}

		let stopped = false;
		let source: EventSource | null = null;
		let reconnectTimeout: number | null = null;

		const indicatorListener: EventListener = (event) => {
			let payload: IndicatorEventPayload | null = null;
			try {
				const message = event as MessageEvent;
				payload = JSON.parse(message.data) as IndicatorEventPayload;
			} catch {
				payload = null;
			}

			if (
				payload?.scope === "chat" &&
				payload.conversationId &&
				activeConversationIdRef.current &&
				payload.conversationId === activeConversationIdRef.current &&
				isChatPathRef.current &&
				payload.reason !== "read"
			) {
				return;
			}

			refreshDockIndicators();
		};

		const readyListener: EventListener = () => {
			refreshDockIndicators();
		};

		const cleanupSource = () => {
			if (!source) {
				return;
			}
			source.removeEventListener("indicator", indicatorListener);
			source.removeEventListener("ready", readyListener);
			source.onerror = null;
			source.close();
			source = null;
		};

		const connect = () => {
			if (stopped) {
				return;
			}

			cleanupSource();

			const next = new EventSource("/api/app-indicators/events", {
				withCredentials: true,
			});
			source = next;

			next.addEventListener("indicator", indicatorListener);
			next.addEventListener("ready", readyListener);

			next.onerror = () => {
				cleanupSource();
				if (stopped) {
					return;
				}
				if (reconnectTimeout !== null) {
					return;
				}
				reconnectTimeout = window.setTimeout(() => {
					reconnectTimeout = null;
					connect();
				}, 5_000);
			};
		};

		connect();

		return () => {
			stopped = true;
			if (reconnectTimeout !== null) {
				window.clearTimeout(reconnectTimeout);
				reconnectTimeout = null;
			}
			cleanupSource();
		};
	}, [mounted, shouldHydrateAppIndicators, refreshDockIndicators]);
	useEffect(() => {
		if (!shouldHydrateAppIndicators) {
			return;
		}

		if (!isChatPath && !isContactsPath) {
			return;
		}

		if (!indicatorState.chat && !indicatorState.contacts) {
			return;
		}

		setIndicatorState((prev) => {
			let changed = false;
			const next = { ...prev };

			if (isChatPath && prev.chat) {
				next.chat = false;
				changed = true;
			}

			if (isContactsPath && prev.contacts) {
				next.contacts = false;
				changed = true;
			}

			return changed ? next : prev;
		});
	}, [
		isChatPath,
		isContactsPath,
		shouldHydrateAppIndicators,
		indicatorState.chat,
		indicatorState.contacts,
	]);
	useEffect(() => {
		if (!mounted || !shouldHydrateAppIndicators) {
			return;
		}

		if (!indicatorsInitializedRef.current) {
			return;
		}

		if (isChatPath || isContactsPath) {
			return;
		}

		refreshDockIndicators();
	}, [
		mounted,
		shouldHydrateAppIndicators,
		isChatPath,
		isContactsPath,
		refreshDockIndicators,
	]);
	const [preferencesOpen, setPreferencesOpen] = useState(false);
	const {
		displaySettings,
		updateDisplaySettings,
		userPrefersLightTheme,
		preferenceToggleTheme,
	} = useDockDisplaySettings();
	const dockPanelRef = useRef<HTMLDivElement | null>(null);
	const panelTheme = useDockContrast(dockPanelRef);
	const isLightTheme = panelTheme === "light";
	const panelTitle = dockT("panel.title");
	const closeLabel = dockT("panel.close");
	const preferenceCopy = {
		magnify: {
			label: dockT("preferences.magnify.label"),
			description: dockT("preferences.magnify.description"),
		},
		labels: {
			label: dockT("preferences.labels.label"),
			description: dockT("preferences.labels.description"),
		},
		theme: {
			label: dockT("preferences.lightMode.label"),
			description: dockT("preferences.lightMode.description"),
		},
		language: {
			label: dockT("preferences.language.label"),
			description: dockT("preferences.language.description"),
		},
	};
	const popoverToneClasses = isLightTheme
		? "border-white/50 text-slate-900"
		: "border-white/15 text-white";
	const preferencesRef = useRef<HTMLDivElement | null>(null);
	const closePreferences = useCallback(
		() => setPreferencesOpen(false),
		[setPreferencesOpen],
	);
	usePreferencePanel({
		open: preferencesOpen,
		pathname,
		onClose: closePreferences,
		panelRef: preferencesRef,
	});
	const { setDirection } = useTransitionDirection();
	const initialTransition = useMemo(() => getStoredLocaleTransition(), []);
	const [pendingLocale, setPendingLocale] = useState<Locale | null>(
		initialTransition?.locale ?? null,
	);
	const [localeTransitionWords, setLocaleTransitionWords] = useState<
		string[] | null
	>(initialTransition?.words ?? null);
	const localeToggleValue = (pendingLocale ?? locale) === "ko";

	useBodyLightTheme(userPrefersLightTheme);

	const baseSize = 52;
	const magnifiedSize = displaySettings.magnify ? 78 : 52;
	const range = displaySettings.magnify ? 180 : 120;
	const panelHeight = 74;
	const dockHeight = 110;

	const {
		mouseX,
		rowHeight,
		height,
		handlers: hoverHandlers,
	} = useDockHoverAnimation({
		panelHeight,
		dockHeight,
		springConfig,
	});

	const stripTrailingSlash = (path: string) => {
		if (path === "/") return "/";
		return path.replace(/\/$/, "");
	};

	const indexForPath = (items: DockNavItem[], path: string | undefined) => {
		if (!path) return -1;

		const normalized = stripTrailingSlash(path);
		return items.findIndex((item) => {
			if (!isLinkItem(item)) return false;

			if (item.match) {
				return item.match(normalized);
			}
			const target = stripTrailingSlash(item.href);
			if (target === "/") return normalized === "/";
			return normalized.startsWith(target);
		});
	};

	const currentIndex = indexForPath(dockItems, pathname);

	const switchLocale = useCallback(
		(targetLocale: Locale) => {
			if (targetLocale === locale) return;
			if (pendingLocale) return;
			setPendingLocale(targetLocale);
			setDirection(0);
			if (typeof window !== "undefined") {
				try {
					window.sessionStorage.setItem(
						LOCALE_TRANSITION_STORAGE_KEY,
						JSON.stringify({
							words: [
								localeDisplayNames[locale] ?? locale,
								localeDisplayNames[targetLocale] ?? targetLocale,
							],
							locale: targetLocale,
							timestamp: Date.now(),
						}),
					);
				} catch {
					// ignore storage errors (private browsing, etc.)
				}
			}
			startTransition(() => {
				router.push(pathname, { locale: targetLocale, scroll: false });
			});
		},
		[locale, pathname, pendingLocale, router, setDirection],
	);

	const handleLocaleTransitionComplete = useCallback(() => {
		setPendingLocale(null);
		setLocaleTransitionWords(null);
	}, []);

	const handleSelect = (item: DockNavItem) => {
		if (!isLinkItem(item)) {
			if (item.id === "preferences") {
				setPreferencesOpen((prev) => !prev);
				return;
			}
			return;
		}

		setPreferencesOpen(false);
		const href = item.href;
		if (shouldHydrateAppIndicators) {
			setIndicatorState((prev) => {
				let changed = false;
				const next = { ...prev };

				if (href.startsWith("/app/chat") && prev.chat) {
					next.chat = false;
					changed = true;
				}

				if (href.startsWith("/app/contacts") && prev.contacts) {
					next.contacts = false;
					changed = true;
				}

				return changed ? next : prev;
			});
		}
		const targetIndex = indexForPath(dockItems, href);
		let dir: 1 | -1 = 1;

		if (targetIndex !== -1 && currentIndex !== -1) {
			dir = targetIndex >= currentIndex ? 1 : -1;
		}

		setDirection(dir);
		router.push(href);
	};

	const activeMatcher = (item: DockNavItem) => {
		if (!isLinkItem(item)) {
			return item.id === "preferences" && preferencesOpen;
		}

		const matcher =
			item.match ??
			((path: string) => {
				const normalizedPath = stripTrailingSlash(path);
				const target = stripTrailingSlash(item.href);
				if (target === "/") return normalizedPath === "/";
				return normalizedPath.startsWith(target);
			});

		return matcher(pathname);
	};

	return (
		<>
			<AnimatePresence>
				{localeTransitionWords && pendingLocale && (
					<LocaleFlipOverlay
						words={localeTransitionWords}
						theme={displaySettings.theme}
						onComplete={handleLocaleTransitionComplete}
						ariaLabel={dockT("aria.localeOverlay")}
					/>
				)}
			</AnimatePresence>
			<AnimatePresence>
				{mounted && (
					<motion.div
						initial={{ opacity: 0, y: 36, scale: 0.94 }}
						animate={{
							opacity: 1,
							y: scrolled ? 0 : 6,
							scale: scrolled ? 0.98 : 1,
						}}
						exit={{ opacity: 0, y: 48, scale: 0.9 }}
						transition={{ type: "spring", stiffness: 220, damping: 26 }}
						className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4"
					>
						<motion.div
							style={{ height }}
							className="pointer-events-auto flex w-full max-w-3xl items-end justify-center"
						>
							<motion.div
								{...hoverHandlers}
								ref={dockPanelRef}
								data-contrast-theme={panelTheme}
								className="dock-panel before:absolute relative before:inset-px flex items-end gap-4 bg-white/12 before:bg-gradient-to-br before:from-white/12 before:to-white/4 before:opacity-80 shadow-[0_26px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl px-4 py-4 border border-white/15 rounded-[32px] before:rounded-[30px] before:content-[''] before:pointer-events-none"
								style={{ height: rowHeight }}
								role="toolbar"
								aria-label={dockT("aria.toolbar")}
							>
								{dockItems.map((item) => {
									const key = isLinkItem(item)
										? item.href
										: `action-${item.id}`;
									const isPreferences =
										!isLinkItem(item) && item.id === "preferences";
									return (
										<div
											key={key}
											className="relative flex items-center"
											ref={isPreferences ? preferencesRef : undefined}
										>
											<DockItem
												item={item}
												onSelect={handleSelect}
												mouseX={mouseX}
												spring={springConfig}
												baseSize={baseSize}
												magnifiedSize={magnifiedSize}
												range={range}
												active={activeMatcher(item)}
												tooltipsEnabled={displaySettings.showLabels}
												theme={panelTheme}
											/>
											{isPreferences && (
												<PreferencesPopover
													open={preferencesOpen}
													toneClasses={popoverToneClasses}
													isLightTheme={isLightTheme}
													panelTitle={panelTitle}
													closeLabel={closeLabel}
													preferenceCopy={preferenceCopy}
													preferenceToggleTheme={preferenceToggleTheme}
													magnifyValue={displaySettings.magnify}
													labelsValue={displaySettings.showLabels}
													lightThemeEnabled={displaySettings.theme === "light"}
													localeToggleValue={localeToggleValue}
													onClose={closePreferences}
													onMagnifyChange={(value) =>
														updateDisplaySettings((prev) => ({
															...prev,
															magnify: value,
														}))
													}
													onLabelsChange={(value) =>
														updateDisplaySettings((prev) => ({
															...prev,
															showLabels: value,
														}))
													}
													onThemeChange={(enabled) =>
														updateDisplaySettings((prev) => ({
															...prev,
															theme: enabled ? "light" : "dark",
														}))
													}
													onLanguageChange={(enabled) =>
														switchLocale(enabled ? "ko" : "en")
													}
												/>
											)}
										</div>
									);
								})}
							</motion.div>
						</motion.div>
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
