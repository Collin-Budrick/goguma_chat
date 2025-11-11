"use client";

import { motion } from "framer-motion";

export type PreferenceToggleTheme = "dark" | "light";

export type PreferenceToggleProps = {
  label: string;
  description: string;
  value: boolean;
  onChange: (value: boolean) => void;
  theme: PreferenceToggleTheme;
};

export function PreferenceToggle({
  label,
  description,
  value,
  onChange,
  theme,
}: PreferenceToggleProps) {
  const isLight = theme === "light";
  const isLightActive = isLight && value;
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

  const buttonClasses = `preference-toggle relative flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-3 text-left transition ${containerClasses} ${isLightActive ? "preference-toggle--active" : ""}`;

  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={buttonClasses}
      role="switch"
      aria-checked={value}
    >
      <span className="flex flex-col">
        <span className={`preference-toggle__label ${labelClasses}`}>{label}</span>
        <span className={`preference-toggle__description ${descriptionClasses}`}>{description}</span>
      </span>
      <span
        className={`preference-toggle-track relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${trackClasses}`}
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
