"use client";

import { motion } from "framer-motion";

import { FlipWords } from "@/components/ui/flip-words";
import type { Locale } from "@/i18n/routing";

import type { ContrastTheme } from "./use-dock-contrast";

export const LOCALE_TRANSITION_STORAGE_KEY = "site-locale-transition";
const LOCALE_TRANSITION_MAX_AGE = 2000;

const localeDisplayNames: Record<Locale, string> = {
  en: "English",
  ko: "한국어",
};

export type LocaleTransitionPayload = {
  locale?: Locale;
  words?: string[];
  timestamp?: number;
};

export type StoredLocaleTransition = {
  locale: Locale;
  words: string[];
};

export const getStoredLocaleTransition = (): StoredLocaleTransition | null => {
  if (typeof window === "undefined") return null;

  const raw = window.sessionStorage.getItem(LOCALE_TRANSITION_STORAGE_KEY);
  if (!raw) return null;

  window.sessionStorage.removeItem(LOCALE_TRANSITION_STORAGE_KEY);

  try {
    const parsed = JSON.parse(raw) as LocaleTransitionPayload;
    if (!parsed.locale || !parsed.words || parsed.words.length === 0) return null;
    if (!parsed.timestamp || Date.now() - parsed.timestamp > LOCALE_TRANSITION_MAX_AGE) {
      return null;
    }

    return { locale: parsed.locale, words: parsed.words };
  } catch {
    return null;
  }
};

export const createLocaleTransitionWords = (currentLocale: Locale, targetLocale: Locale) => [
  localeDisplayNames[currentLocale] ?? currentLocale,
  localeDisplayNames[targetLocale] ?? targetLocale,
];

export const persistLocaleTransition = (targetLocale: Locale, words: string[]) => {
  if (typeof window === "undefined") return;

  const payload: LocaleTransitionPayload = {
    locale: targetLocale,
    words,
    timestamp: Date.now(),
  };

  try {
    window.sessionStorage.setItem(
      LOCALE_TRANSITION_STORAGE_KEY,
      JSON.stringify(payload),
    );
  } catch {
    // Ignore storage errors (private browsing, etc.)
  }
};

export const scheduleLocaleTransition = (currentLocale: Locale, targetLocale: Locale) => {
  const words = createLocaleTransitionWords(currentLocale, targetLocale);
  persistLocaleTransition(targetLocale, words);
  return words;
};

export function LocaleFlipOverlay({
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
  const surfaceClasses = isLight ? "bg-white/85 text-slate-900" : "bg-black/85 text-white";

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
