"use client";

import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransitionDirection } from "./transition-context";
import { isLinkItem, resolveDock, type DockNavItem } from "./site-dock/navigation";
import { type Locale } from "@/i18n/routing";
import { PreferenceToggle, type PreferenceToggleTheme } from "@/components/ui/preference-toggle";
import {
  DisplaySettings,
  DISPLAY_SETTINGS_EVENT,
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
  persistDisplaySettings,
} from "@/lib/display-settings";
import {
  LocaleFlipOverlay,
  getStoredLocaleTransition,
  scheduleLocaleTransition,
} from "./site-dock/locale-transition";
import {
  useDockContrast,
  type ContrastTheme,
} from "./site-dock/use-dock-contrast";

const springConfig = { mass: 0.15, stiffness: 180, damping: 16 };

function DockItem({
  item,
  onSelect,
  mouseX,
  spring,
  baseSize,
  magnifiedSize,
  range,
  active,
  tooltipsEnabled,
  theme,
}: {
  item: DockNavItem;
  onSelect: (item: DockNavItem) => void;
  mouseX: MotionValue<number>;
  spring: typeof springConfig;
  baseSize: number;
  magnifiedSize: number;
  range: number;
  active: boolean;
  tooltipsEnabled: boolean;
  theme: ContrastTheme;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const hover = useMotionValue<number>(0);
  const [isHovered, setIsHovered] = useState(() => hover.get() === 1);

  useEffect(() => {
    const unsubscribe = hover.on("change", (latest) => {
      setIsHovered(latest === 1);
    });
    return () => unsubscribe();
  }, [hover]);

  const showLabel = tooltipsEnabled && isHovered;

  const distance = useTransform(mouseX, (value: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return Infinity;
    return value - rect.left - rect.width / 2;
  });

  const targetSize = useTransform(
    distance,
    [-range, 0, range],
    [baseSize, magnifiedSize, baseSize],
  );

  const size = useSpring(targetSize, spring);
  const lift = useSpring(
    useTransform(targetSize, (val) => -Math.max(0, val - baseSize) / 2),
    spring,
  );

  const Icon = item.icon;
  const isLightTheme = theme === "light";
  const buttonStateClasses = active
    ? isLightTheme
      ? "border-slate-300 bg-white/90"
      : "border-white/40 bg-white/25"
    : isLightTheme
      ? "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white/80"
      : "border-white/15 bg-white/10 hover:border-white/30 hover:bg-white/18";

  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size, y: lift }}
      onMouseEnter={() => hover.set(1)}
      onMouseLeave={() => hover.set(0)}
      onFocus={() => hover.set(1)}
      onBlur={() => hover.set(0)}
      onClick={() => onSelect(item)}
      data-contrast-theme={theme}
      data-state={active ? "active" : undefined}
      className={`dock-button relative isolate flex items-center justify-center rounded-2xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${isLightTheme ? "focus-visible:ring-slate-900/30 focus-visible:ring-offset-white" : "focus-visible:ring-white/70 focus-visible:ring-offset-black"} ${buttonStateClasses}`}
      type="button"
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      aria-pressed={!isLinkItem(item) ? active : undefined}
    >
      <Icon
        className={`h-5 w-5 ${active
            ? isLightTheme
              ? "text-slate-900"
              : "text-white"
            : isLightTheme
              ? "text-slate-600"
              : "text-white/80"
          }`}
        aria-hidden
      />
      <AnimatePresence>
        {showLabel && (
          <motion.span
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -12 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.18 }}
            className={`dock-tooltip -top-3 left-1/2 z-20 absolute px-2 py-1 border rounded-md font-medium text-[10px] uppercase tracking-[0.2em] whitespace-nowrap -translate-x-1/2 pointer-events-none ${isLightTheme
                ? "border-slate-200 bg-white text-slate-800 shadow-[0_12px_24px_rgba(148,163,184,0.32)]"
                : "border-white/20 bg-black/80 text-white shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
              }`}
            role="tooltip"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function SiteDock() {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale() as Locale;
  const dockT = useTranslations("Shell.dock");
  const dockItems = useMemo(
    () => resolveDock(pathname, (key) => dockT(key)),
    [pathname, dockT],
  );
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => DEFAULT_DISPLAY_SETTINGS);
  const userPrefersLightTheme = displaySettings.theme === "light";
  const dockPanelRef = useRef<HTMLDivElement | null>(null);
  const panelTheme = useDockContrast(dockPanelRef);
  const isLightTheme = panelTheme === "light";
  const preferenceToggleTheme: PreferenceToggleTheme = displaySettings.theme === "light" ? "light" : "dark";
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
  const updateDisplaySettings = useCallback(
    (updater: (prev: DisplaySettings) => DisplaySettings) => {
      setDisplaySettings((prev) => {
        const next = updater(prev);
        persistDisplaySettings(next);
        return next;
      });
    },
    [],
  );

  const popoverToneClasses = isLightTheme
    ? "border-white/50 text-slate-900"
    : "border-white/15 text-white";
  const preferencesRef = useRef<HTMLDivElement | null>(null);
  const previousPathnameRef = useRef(pathname);
  const { setDirection } = useTransitionDirection();
  const initialTransition = useMemo(() => getStoredLocaleTransition(), []);
  const [pendingLocale, setPendingLocale] = useState<Locale | null>(initialTransition?.locale ?? null);
  const [localeTransitionWords, setLocaleTransitionWords] = useState<string[] | null>(
    initialTransition?.words ?? null,
  );
  const localeToggleValue = (pendingLocale ?? locale) === "ko";

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = loadDisplaySettings();
    setDisplaySettings(stored);

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DisplaySettings>).detail;
      setDisplaySettings((prev) => {
        if (
          prev.magnify === detail.magnify &&
          prev.showLabels === detail.showLabels &&
          prev.theme === detail.theme
        ) {
          return prev;
        }
        return detail;
      });
    };
    window.addEventListener(DISPLAY_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(DISPLAY_SETTINGS_EVENT, handler);
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (userPrefersLightTheme) {
      document.body.classList.add("theme-light");
    } else {
      document.body.classList.remove("theme-light");
    }

    return () => {
      document.body.classList.remove("theme-light");
    };
  }, [userPrefersLightTheme]);

  useEffect(() => {
    if (!preferencesOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!preferencesRef.current) return;
      if (!preferencesRef.current.contains(event.target as Node)) {
        setPreferencesOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPreferencesOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [preferencesOpen]);

  useEffect(() => {
    if (!preferencesOpen) {
      previousPathnameRef.current = pathname;
      return;
    }
    if (previousPathnameRef.current === pathname) return;

    const frame = requestAnimationFrame(() => setPreferencesOpen(false));
    previousPathnameRef.current = pathname;
    return () => cancelAnimationFrame(frame);
  }, [pathname, preferencesOpen]);

  const mouseX = useMotionValue<number>(Infinity);
  const hover = useMotionValue<number>(0);

  const baseSize = 52;
  const magnifiedSize = displaySettings.magnify ? 78 : 52;
  const range = displaySettings.magnify ? 180 : 120;
  const panelHeight = 74;
  const dockHeight = 110;

  const maxHeight = useMemo(
    () => Math.max(dockHeight, magnifiedSize + magnifiedSize / 2 + 12),
    [dockHeight, magnifiedSize],
  );
  const rowHeight = useTransform(hover, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(rowHeight, springConfig);

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
      const words = scheduleLocaleTransition(locale, targetLocale);
      setLocaleTransitionWords(words);
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
                onMouseMove={(event) => {
                  hover.set(1);
                  mouseX.set(event.pageX);
                }}
                onMouseLeave={() => {
                  hover.set(0);
                  mouseX.set(Infinity);
                }}
                onMouseEnter={() => hover.set(1)}
                ref={dockPanelRef}
                data-contrast-theme={panelTheme}
                className="dock-panel before:absolute relative before:inset-px flex items-end gap-4 bg-white/12 before:bg-gradient-to-br before:from-white/12 before:to-white/4 before:opacity-80 shadow-[0_26px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl px-4 py-4 border border-white/15 rounded-[32px] before:rounded-[30px] before:content-[''] before:pointer-events-none"
                style={{ height: panelHeight }}
                role="toolbar"
                aria-label={dockT("aria.toolbar")}
              >
                {dockItems.map((item) => {
                  const key = isLinkItem(item) ? item.href : `action-${item.id}`;
                  const isPreferences = !isLinkItem(item) && item.id === "preferences";
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
                        <AnimatePresence>
                          {preferencesOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 12, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 12, scale: 0.95 }}
                              transition={{ type: "spring", stiffness: 280, damping: 26 }}
                              className={`dock-popover pointer-events-auto absolute bottom-full left-1/2 z-50 w-64 -translate-x-1/2 rounded-2xl border p-4 ${popoverToneClasses}`}
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-[0.32em] ${isLightTheme ? "text-slate-500" : "text-white/60"}`}
                                >
                                  {panelTitle}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPreferencesOpen(false)}
                                  className={`rounded-full border p-1 transition ${isLightTheme
                                      ? "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                                      : "border-white/10 bg-white/10 text-white/70 hover:border-white/25 hover:bg-white/20 hover:text-white"
                                    }`}
                                  aria-label={closeLabel}
                                >
                                  <X className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                              <div className="flex flex-col gap-2">
                                <PreferenceToggle
                                  label={preferenceCopy.magnify.label}
                                  description={preferenceCopy.magnify.description}
                                  value={displaySettings.magnify}
                                  theme={preferenceToggleTheme}
                                  onChange={(value) =>
                                    updateDisplaySettings((prev) => ({ ...prev, magnify: value }))
                                  }
                                />
                                <PreferenceToggle
                                  label={preferenceCopy.labels.label}
                                  description={preferenceCopy.labels.description}
                                  value={displaySettings.showLabels}
                                  theme={preferenceToggleTheme}
                                  onChange={(value) =>
                                    updateDisplaySettings((prev) => ({ ...prev, showLabels: value }))
                                  }
                                />
                                <PreferenceToggle
                                  label={preferenceCopy.theme.label}
                                  description={preferenceCopy.theme.description}
                                  value={displaySettings.theme === "light"}
                                  theme={preferenceToggleTheme}
                                  onChange={(enabled) =>
                                    updateDisplaySettings((prev) => ({
                                      ...prev,
                                      theme: enabled ? "light" : "dark",
                                    }))
                                  }
                                />
                                <PreferenceToggle
                                  label={preferenceCopy.language.label}
                                  description={preferenceCopy.language.description}
                                  value={localeToggleValue}
                                  theme={preferenceToggleTheme}
                                  onChange={(enabled) => switchLocale(enabled ? "ko" : "en")}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
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
