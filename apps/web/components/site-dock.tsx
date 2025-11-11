"use client";

import type { ComponentType, RefObject } from "react";
import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransitionDirection } from "./transition-context";
import { FlipWords } from "@/components/ui/flip-words";
import { type Locale } from "@/i18n/routing";
import { PreferenceToggle, type PreferenceToggleTheme } from "@/components/ui/preference-toggle";
import {
  DisplaySettings,
  DISPLAY_SETTINGS_EVENT,
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
  persistDisplaySettings,
} from "@/lib/display-settings";

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

type DockLinkDefinition = Omit<DockLinkItem, "label"> & {
  labelKey: string;
};

type DockActionDefinition = Omit<DockActionItem, "label"> & {
  labelKey: string;
};

type DockNavDefinition = DockLinkDefinition | DockActionDefinition;

function isLinkItem(item: DockNavItem): item is DockLinkItem {
  return item.type === "link";
}

const marketingDock: DockNavDefinition[] = [
  {
    type: "link",
    href: "/",
    labelKey: "nav.marketing.home",
    icon: Home,
    match: (path) => path === "/",
  },
  {
    type: "link",
    href: "/login",
    labelKey: "nav.marketing.account",
    icon: CircleUserRound,
    match: (path) => path.startsWith("/login") || path.startsWith("/signup"),
  },
  {
    type: "action",
    id: "preferences",
    labelKey: "nav.shared.display",
    icon: Settings2,
  },
];

const appDock: DockNavDefinition[] = [
  {
    type: "link",
    href: "/app/dashboard",
    labelKey: "nav.app.overview",
    icon: LayoutDashboard,
  },
  {
    type: "link",
    href: "/app/chat",
    labelKey: "nav.app.chats",
    icon: MessageSquare,
  },
  {
    type: "link",
    href: "/app/contacts",
    labelKey: "nav.app.contacts",
    icon: Users,
  },
  {
    type: "link",
    href: "/app/settings",
    labelKey: "nav.app.settings",
    icon: Settings2,
  },
  {
    type: "action",
    id: "preferences",
    labelKey: "nav.shared.display",
    icon: SlidersHorizontal,
  },
  {
    type: "link",
    href: "/profile",
    labelKey: "nav.app.profile",
    icon: CircleUserRound,
  },
];

const adminDock: DockNavDefinition[] = [
  {
    type: "link",
    href: "/admin",
    labelKey: "nav.admin.console",
    icon: LayoutDashboard,
  },
  {
    type: "link",
    href: "/admin/push",
    labelKey: "nav.admin.broadcasts",
    icon: Megaphone,
  },
  {
    type: "link",
    href: "/admin/users",
    labelKey: "nav.admin.roster",
    icon: Layers,
  },
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

type ContrastTheme = "light" | "dark";

type RGBColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const parseRGBColor = (value: string): RGBColor | null => {
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
    a: alpha !== undefined ? Math.min(1, Math.max(0, Number.parseFloat(alpha))) : 1,
  };
};

const relativeLuminance = (color: RGBColor) => {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  const r = channel(color.r);
  const g = channel(color.g);
  const b = channel(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const getEffectiveBackgroundColor = (node: Element | null): RGBColor | null => {
  if (typeof window === "undefined" || typeof document === "undefined") return null;
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

type ContrastSampler = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => ContrastTheme;
  getServerSnapshot: () => ContrastTheme;
  setEnabled: (value: boolean) => void;
};

const createContrastSampler = (ref: RefObject<HTMLElement>): ContrastSampler => {
  const listeners = new Set<() => void>();
  const events: Array<keyof WindowEventMap> = ["scroll", "resize", "pointermove"];
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
      luminanceSamples.reduce((total, sample) => total + sample, 0) / luminanceSamples.length
    );
  };
  const BRIGHT_BACKGROUND_THRESHOLD = 0.62;
  const DARK_BACKGROUND_THRESHOLD = 0.48;

  const notify = () => {
    listeners.forEach((listener) => listener());
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
    if (typeof window === "undefined" || typeof document === "undefined") return;
    const targetElement = ref.current;
    if (!targetElement) return;
    const rect = targetElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    if (centerX < 0 || centerY < 0 || centerX > window.innerWidth || centerY > window.innerHeight) {
      return;
    }

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
    const samplePoints: Array<[number, number]> = [
      [centerX, centerY],
      [centerX, clamp(rect.bottom - rect.height / 4, 0, window.innerHeight - 1)],
      [centerX, clamp(rect.top + rect.height / 4, 0, window.innerHeight - 1)],
    ];

    const colors = samplePoints
      .map(([x, y]) => getUnderlayColor(x, y))
      .filter((color): color is RGBColor => Boolean(color));

    if (colors.length === 0) return;

    const luminance =
      colors.reduce((total, color) => total + relativeLuminance(color), 0) / colors.length;
    const smoothedLuminance = getSmoothedLuminance(luminance);

    let nextTone: ContrastTheme = tone;
    if (tone === "light" && smoothedLuminance >= BRIGHT_BACKGROUND_THRESHOLD) {
      nextTone = "dark";
    } else if (tone === "dark" && smoothedLuminance <= DARK_BACKGROUND_THRESHOLD) {
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
    if (typeof window === "undefined" || typeof document === "undefined") return;
    events.forEach((event) => window.addEventListener(event, schedule, { passive: true }));
    document.addEventListener("scroll", schedule, { passive: true, capture: true });
    schedule();
  };

  const detach = () => {
    if (typeof window === "undefined" || typeof document === "undefined") return;
    events.forEach((event) => window.removeEventListener(event, schedule));
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

function useDockContrast(ref: RefObject<HTMLElement>): ContrastTheme {
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

function resolveDock(
  pathname: string,
  resolveLabel: (key: string) => string,
): DockNavItem[] {
  const hydrate = (items: DockNavDefinition[]) =>
    items.map((item) => ({
      ...item,
      label: resolveLabel(item.labelKey),
    }));
  if (pathname.startsWith("/admin")) return hydrate(adminDock);
  if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
    return hydrate(appDock);
  }
  return hydrate(marketingDock);
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

function LocaleFlipOverlay({
  words,
  theme,
  onComplete,
  ariaLabel,
}: {
  words: string[];
  theme: "dark" | "light";
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
