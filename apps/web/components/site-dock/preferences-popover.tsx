import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";

import { PreferenceToggle, type PreferenceToggleTheme } from "@/components/ui/preference-toggle";

export type PreferenceItemCopy = {
  label: string;
  description: string;
};

export type PreferencesCopy = {
  magnify: PreferenceItemCopy;
  labels: PreferenceItemCopy;
  theme: PreferenceItemCopy;
  language: PreferenceItemCopy;
};

export type PreferencesPopoverProps = {
  open: boolean;
  toneClasses: string;
  isLightTheme: boolean;
  panelTitle: string;
  closeLabel: string;
  preferenceCopy: PreferencesCopy;
  preferenceToggleTheme: PreferenceToggleTheme;
  magnifyValue: boolean;
  labelsValue: boolean;
  lightThemeEnabled: boolean;
  localeToggleValue: boolean;
  onClose: () => void;
  onMagnifyChange: (value: boolean) => void;
  onLabelsChange: (value: boolean) => void;
  onThemeChange: (value: boolean) => void;
  onLanguageChange: (value: boolean) => void;
};

export function PreferencesPopover({
  open,
  toneClasses,
  isLightTheme,
  panelTitle,
  closeLabel,
  preferenceCopy,
  preferenceToggleTheme,
  magnifyValue,
  labelsValue,
  lightThemeEnabled,
  localeToggleValue,
  onClose,
  onMagnifyChange,
  onLabelsChange,
  onThemeChange,
  onLanguageChange,
}: PreferencesPopoverProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 280, damping: 26 }}
          className={`dock-popover pointer-events-auto absolute bottom-full left-1/2 z-50 w-64 -translate-x-1/2 rounded-2xl border p-4 ${toneClasses}`}
        >
          <div className="mb-2 flex items-center justify-between">
            <span
              className={`text-[10px] font-semibold uppercase tracking-[0.32em] ${
                isLightTheme ? "text-slate-500" : "text-white/60"
              }`}
            >
              {panelTitle}
            </span>
            <button
              type="button"
              onClick={onClose}
              className={`rounded-full border p-1 transition ${
                isLightTheme
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
              value={magnifyValue}
              theme={preferenceToggleTheme}
              onChange={onMagnifyChange}
            />
            <PreferenceToggle
              label={preferenceCopy.labels.label}
              description={preferenceCopy.labels.description}
              value={labelsValue}
              theme={preferenceToggleTheme}
              onChange={onLabelsChange}
            />
            <PreferenceToggle
              label={preferenceCopy.theme.label}
              description={preferenceCopy.theme.description}
              value={lightThemeEnabled}
              theme={preferenceToggleTheme}
              onChange={onThemeChange}
            />
            <PreferenceToggle
              label={preferenceCopy.language.label}
              description={preferenceCopy.language.description}
              value={localeToggleValue}
              theme={preferenceToggleTheme}
              onChange={onLanguageChange}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
