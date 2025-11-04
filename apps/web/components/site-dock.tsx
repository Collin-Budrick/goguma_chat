"use client";

import type { ComponentType } from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  CircleUserRound,
  Home,
  Layers,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings2,
  X,
} from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransitionDirection } from "./transition-context";
import { FlipWords } from "@/components/ui/flip-words";
import { type Locale } from "@/i18n/routing";

type DockLinkItem = {
  type: "link";
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
};

type DockActionItem = {
  type: "action";
  id: "preferences";
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type DockNavItem = DockLinkItem | DockActionItem;

function isLinkItem(item: DockNavItem): item is DockLinkItem {
  return item.type === "link";
}

const marketingDock: DockNavItem[] = [
  { type: "link", href: "/", label: "Home", icon: Home, match: (path) => path === "/" },
  {
    type: "link",
    href: "/login",
    label: "Account",
    icon: CircleUserRound,
    match: (path) => path.startsWith("/login") || path.startsWith("/signup"),
  },
  {
    type: "action",
    id: "preferences",
    label: "Display",
    icon: Settings2,
  },
];

const appDock: DockNavItem[] = [
  { type: "link", href: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { type: "link", href: "/app/chat", label: "Chats", icon: MessageSquare },
  {
    type: "action",
    id: "preferences",
    label: "Display",
    icon: Settings2,
  },
  { type: "link", href: "/profile", label: "Profile", icon: CircleUserRound },
];

const adminDock: DockNavItem[] = [
  { type: "link", href: "/admin", label: "Console", icon: LayoutDashboard },
  { type: "link", href: "/admin/push", label: "Broadcasts", icon: Megaphone },
  { type: "link", href: "/admin/users", label: "Roster", icon: Layers },
];

const springConfig = { mass: 0.15, stiffness: 180, damping: 16 };

const LOCALE_TRANSITION_STORAGE_KEY = "site-locale-transition";

type LocaleTransitionPayload = {
  locale?: Locale;
  words?: string[];
  timestamp?: number;
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
    if (!parsed.locale || !parsed.words || parsed.words.length === 0) return null;
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

type DisplaySettings = {
  magnify: boolean;
  showLabels: boolean;
  theme: "dark" | "light";
};

function resolveDock(pathname: string): DockNavItem[] {
  if (pathname.startsWith("/admin")) return adminDock;
  if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
    return appDock;
  }
  return marketingDock;
}

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
  theme: "dark" | "light";
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
            className={`dock-tooltip -top-3 left-1/2 z-20 absolute px-2 py-1 border rounded-md font-medium text-[10px] uppercase tracking-[0.2em] -translate-x-1/2 pointer-events-none ${isLightTheme
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

function PreferenceToggle({
  label,
  description,
  value,
  onChange,
  theme,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  theme: "dark" | "light";
}) {
  const isLight = theme === "light";
  const containerClasses = isLight
    ? "border-slate-200 bg-white/90 hover:border-slate-300 hover:bg-white"
    : "border-white/10 bg-white/5 hover:border-white/25 hover:bg-white/10";
  const labelClasses = isLight ? "text-sm font-medium text-slate-900" : "text-sm font-medium text-white";
  const descriptionClasses = isLight ? "text-xs text-slate-600" : "text-xs text-white/70";
  const trackClasses = isLight
    ? value
      ? "bg-slate-900"
      : "bg-slate-300"
    : value
      ? "bg-white"
      : "bg-white/30";
  const thumbClasses = isLight ? "bg-white shadow-sm" : "bg-black/90 shadow-lg";

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${containerClasses}`}
      role="switch"
      aria-checked={value}
    >
      <span className="flex flex-col">
        <span className={labelClasses}>{label}</span>
        <span className={descriptionClasses}>{description}</span>
      </span>
      <span
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${trackClasses}`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 520, damping: 32 }}
          className={`absolute left-1 top-1 h-4 w-4 rounded-full transition-colors ${thumbClasses}`}
          style={{ x: value ? 18 : 0 }}
        />
      </span>
    </button>
  );
}

function LocaleFlipOverlay({
  words,
  theme,
  onComplete,
}: {
  words: string[];
  theme: "dark" | "light";
  onComplete: () => void;
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
      aria-label="Switching language"
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
  const dockItems = useMemo(() => resolveDock(pathname), [pathname]);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => {
    const defaults: DisplaySettings = {
      magnify: true,
      showLabels: true,
      theme: "dark",
    };

    if (typeof window === "undefined") {
      return defaults;
    }

    try {
      const stored = window.localStorage.getItem("site-dock-display");
      if (!stored) return defaults;
      const parsed = JSON.parse(stored) as Partial<DisplaySettings>;
      return {
        ...defaults,
        ...parsed,
        theme: parsed.theme === "light" ? "light" : "dark",
      };
    } catch {
      return defaults;
    }
  });
  const isLightTheme = displaySettings.theme === "light";
  const popoverToneClasses = isLightTheme
    ? "border-slate-200 bg-white text-slate-900 shadow-[0_30px_70px_rgba(148,163,184,0.35)]"
    : "border-white/12 bg-black/85 text-white shadow-[0_30px_80px_rgba(0,0,0,0.55)]";
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
    window.localStorage.setItem("site-dock-display", JSON.stringify(displaySettings));
  }, [displaySettings]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isLightTheme) {
      document.body.classList.add("theme-light");
    } else {
      document.body.classList.remove("theme-light");
    }

    return () => {
      document.body.classList.remove("theme-light");
    };
  }, [isLightTheme]);

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
                className="dock-panel before:absolute relative before:inset-px flex items-end gap-4 bg-white/12 before:bg-gradient-to-br before:from-white/12 before:to-white/4 before:opacity-80 shadow-[0_26px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl px-4 py-4 border border-white/15 rounded-[32px] before:rounded-[30px] before:content-[''] before:pointer-events-none"
                style={{ height: panelHeight }}
                role="toolbar"
                aria-label="Application dock"
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
                        theme={displaySettings.theme}
                      />
                      {isPreferences && (
                        <AnimatePresence>
                          {preferencesOpen && (
                            <motion.div
                              initial={{ opacity: 0, y: 12, scale: 0.95 }}
                              animate={{ opacity: 1, y: 0, scale: 1 }}
                              exit={{ opacity: 0, y: 12, scale: 0.95 }}
                              transition={{ type: "spring", stiffness: 280, damping: 26 }}
                              className={`dock-popover pointer-events-auto absolute bottom-full left-1/2 z-50 w-64 -translate-x-1/2 rounded-2xl border p-4 backdrop-blur-2xl ${popoverToneClasses}`}
                            >
                              <div className="mb-2 flex items-center justify-between">
                                <span
                                  className={`text-[10px] font-semibold uppercase tracking-[0.32em] ${isLightTheme ? "text-slate-500" : "text-white/60"}`}
                                >
                                  Display
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setPreferencesOpen(false)}
                                  className={`rounded-full border p-1 transition ${isLightTheme
                                      ? "border-slate-200 bg-white/80 text-slate-600 hover:border-slate-300 hover:bg-white hover:text-slate-900"
                                      : "border-white/10 bg-white/10 text-white/70 hover:border-white/25 hover:bg-white/20 hover:text-white"
                                    }`}
                                  aria-label="Close display settings"
                                >
                                  <X className="h-3 w-3" aria-hidden />
                                </button>
                              </div>
                              <div className="flex flex-col gap-2">
                                <PreferenceToggle
                                  label="Dock magnification"
                                  description="Enlarge icons near your cursor."
                                  value={displaySettings.magnify}
                                  theme={displaySettings.theme}
                                  onChange={(value) =>
                                    setDisplaySettings((prev) => ({ ...prev, magnify: value }))
                                  }
                                />
                                <PreferenceToggle
                                  label="Label tooltips"
                                  description="Reveal item labels on hover."
                                  value={displaySettings.showLabels}
                                  theme={displaySettings.theme}
                                  onChange={(value) =>
                                    setDisplaySettings((prev) => ({ ...prev, showLabels: value }))
                                  }
                                />
                                <PreferenceToggle
                                  label="Light mode"
                                  description="Bright surfaces and dark text."
                                  value={displaySettings.theme === "light"}
                                  theme={displaySettings.theme}
                                  onChange={(enabled) =>
                                    setDisplaySettings((prev) => ({
                                      ...prev,
                                      theme: enabled ? "light" : "dark",
                                    }))
                                  }
                                />
                              <PreferenceToggle
                                label="Korean language"
                                description="Switch interface text to 한국어."
                                value={localeToggleValue}
                                theme={displaySettings.theme}
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
