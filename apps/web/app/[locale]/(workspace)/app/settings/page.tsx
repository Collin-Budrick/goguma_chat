"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

const PREFERENCE_IDS = ["notifications", "aiDrafts", "presence"] as const;

export default function SettingsPage() {
  const t = useTranslations("Settings");
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
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">{t("motion.title")}</h2>
          <p className="text-sm text-white/60">{t("motion.description")}</p>
        </header>
        <button
          type="button"
          onClick={() => setMotion((value) => !value)}
          className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
            motion ? "bg-white text-black" : "border border-white/20 text-white/70"
          }`}
        >
          {motion ? t("motion.on") : t("motion.off")}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">{t("preferences.title")}</h2>
          <p className="text-sm text-white/60">{t("preferences.description")}</p>
        </header>
        <div className="space-y-4">
          {preferenceCopy.map((item) => {
            const active = prefs[item.id] ?? false;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setPrefs((prev) => ({ ...prev, [item.id]: !active }))
                }
                className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? "border-white/40 bg-white text-black"
                    : "border-white/10 bg-black text-white"
                }`}
              >
                <div className="flex items-center justify-between text-sm font-medium">
                  <span>{item.label}</span>
                  <span className="text-xs uppercase tracking-[0.3em]">
                    {active ? t("preferences.state.on") : t("preferences.state.off")}
                  </span>
                </div>
                <p
                  className={`mt-2 text-xs ${
                    active ? "text-black/60" : "text-white/60"
                  }`}
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
