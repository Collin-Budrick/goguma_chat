"use client";

import { useState } from "react";

const PREFERENCES = [
  {
    id: "notifications",
    label: "Push notifications",
    description: "Send alerts for mentions, escalations, and assignments.",
  },
  {
    id: "ai-drafts",
    label: "AI drafting",
    description: "Suggest replies with context from previous customer threads.",
  },
  {
    id: "presence",
    label: "Smart presence",
    description: "Auto-update my status when in focus mode or away.",
  },
];

export default function SettingsPage() {
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [motion, setMotion] = useState(true);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({
    notifications: true,
    "ai-drafts": true,
    presence: false,
  });

  return (
    <div className="space-y-8">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">Appearance</h2>
          <p className="text-sm text-white/60">
            Personalize your OLED workspace vibe.
          </p>
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
              {value} mode
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">Motion</h2>
          <p className="text-sm text-white/60">
            Reduce motion for recording or accessibility needs.
          </p>
        </header>
        <button
          type="button"
          onClick={() => setMotion((value) => !value)}
          className={`rounded-full px-6 py-3 text-sm font-semibold transition ${
            motion ? "bg-white text-black" : "border border-white/20 text-white/70"
          }`}
        >
          {motion ? "Motion on" : "Motion off"}
        </button>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="mb-6">
          <h2 className="text-xl font-semibold text-white">Preferences</h2>
          <p className="text-sm text-white/60">
            Choose the automations that keep you in flow.
          </p>
        </header>
        <div className="space-y-4">
          {PREFERENCES.map((item) => {
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
                    {active ? "On" : "Off"}
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
