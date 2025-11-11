"use client";

import { startTransition, useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useTransitionDirection } from "@/components/transition-context";
import {
  DisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_EVENT,
  loadDisplaySettings,
  persistDisplaySettings,
} from "@/lib/display-settings";
import { type Locale } from "@/i18n/routing";

const PREFERENCE_IDS = ["notifications", "aiDrafts", "presence"] as const;

export default function SettingsPage() {
  const t = useTranslations("Settings");
  const dockT = useTranslations("Shell.dock");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const { setDirection } = useTransitionDirection();
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(() => DEFAULT_DISPLAY_SETTINGS);

  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [motion, setMotion] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    notifications: true,
    aiDrafts: true,
    presence: false,
  });
  const preferenceCopy = PREFERENCE_IDS.map((id) => ({
    id,
    label: t(`preferences.items.${id}.label`),
    description: t(`preferences.items.${id}.description`),
  }));

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = loadDisplaySettings();
    setDisplaySettings(stored);

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DisplaySettings>).detail;
      setDisplaySettings((prev) =>
        prev.magnify === detail.magnify &&
        prev.showLabels === detail.showLabels &&
        prev.theme === detail.theme
          ? prev
          : detail,
      );
    };
    window.addEventListener(DISPLAY_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(DISPLAY_SETTINGS_EVENT, handler);
  }, []);

  const handleLocaleToggle = useCallback(
    (enabled: boolean) => {
      const targetLocale = (enabled ? "ko" : "en") as Locale;
      if (targetLocale === locale) return;
      setDirection(0);
      startTransition(() => {
        router.push(pathname, { locale: targetLocale, scroll: false });
      });
    },
    [locale, pathname, router, setDirection],
  );

  const displayEntries = [
    {
      id: "magnify",
      label: dockT("preferences.magnify.label"),
      description: dockT("preferences.magnify.description"),
      active: displaySettings.magnify,
      onToggle: () =>
        updateDisplaySettings((prev) => ({ ...prev, magnify: !prev.magnify })),
    },
    {
      id: "labels",
      label: dockT("preferences.labels.label"),
      description: dockT("preferences.labels.description"),
      active: displaySettings.showLabels,
      onToggle: () =>
        updateDisplaySettings((prev) => ({ ...prev, showLabels: !prev.showLabels })),
    },
    {
      id: "light",
      label: dockT("preferences.lightMode.label"),
      description: dockT("preferences.lightMode.description"),
      active: displaySettings.theme === "light",
      onToggle: () =>
        updateDisplaySettings((prev) => ({
          ...prev,
          theme: prev.theme === "light" ? "dark" : "light",
        })),
    },
    {
      id: "locale",
      label: dockT("preferences.language.label"),
      description: dockT("preferences.language.description"),
      active: locale === "ko",
      onToggle: () => handleLocaleToggle(locale !== "ko"),
    },
    {
      id: "motion",
      label: t("motion.title"),
      description: t("motion.description"),
      active: motion,
      onToggle: () => setMotion((prev) => !prev),
    },
  ];

  const isLightThemeEnabled = displaySettings.theme === "light";
  const cardTone = isLightThemeEnabled
    ? {
        active: { container: "border-black bg-black text-white", description: "text-white/70" },
        inactive: { container: "border-black/10 bg-white text-slate-900", description: "text-slate-500" },
      }
    : {
        active: { container: "border-white/40 bg-white text-black", description: "text-black/60" },
        inactive: { container: "border-white/10 bg-black text-white", description: "text-white/60" },
      };

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">{t("appearance.title")}</h2>
          <p className="text-sm text-white/60">{t("appearance.description")}</p>
        </header>
        <div className="flex flex-wrap gap-3">
          {(["dark", "light"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setMode(value)}
              className={`rounded-full border px-4 py-2 text-xs uppercase tracking-[0.3em] transition ${
                mode === value
                  ? "border-white bg-white text-black"
                  : "border-white/20 text-white/60 hover:text-white"
              }`}
            >
              {t(`appearance.modes.${value}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-4">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.32em] text-white/60">
            {dockT("panel.title")}
          </h2>
        </header>
        <div className="space-y-4">
          {displayEntries.map((entry) => {
            const tone = entry.active ? cardTone.active : cardTone.inactive;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={entry.onToggle}
                className={"w-full rounded-2xl border px-4 py-4 text-left transition " + tone.container}
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{entry.label}</span>
                  <span className="text-xs uppercase tracking-[0.3em]">
                    {entry.active ? t("preferences.state.on") : t("preferences.state.off")}
                  </span>
                </div>
                <p
                  className={"mt-2 text-xs " + tone.description}
                >
                  {entry.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">{t("preferences.title")}</h2>
          <p className="text-sm text-white/60">{t("preferences.description")}</p>
        </header>
        <div className="space-y-4">
          {preferenceCopy.map((item) => {
            const active = prefs[item.id] ?? false;
            const tone = active ? cardTone.active : cardTone.inactive;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setPrefs((prev) => ({ ...prev, [item.id]: !active }))
                }
                className={"w-full rounded-2xl border px-4 py-4 text-left transition " + tone.container}
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{item.label}</span>
                  <span className="text-xs uppercase tracking-[0.3em]">
                    {active ? t("preferences.state.on") : t("preferences.state.off")}
                  </span>
                </div>
                <p
                  className={"mt-2 text-xs " + tone.description}
                >
                  {item.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
