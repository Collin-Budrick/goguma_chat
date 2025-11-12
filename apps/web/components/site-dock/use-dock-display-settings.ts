import { useCallback, useEffect, useState } from "react";

import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_EVENT,
  loadDisplaySettings,
  persistDisplaySettings,
  type DisplaySettings,
} from "@/lib/display-settings";
import { type PreferenceToggleTheme } from "@/components/ui/preference-toggle";

export function useDockDisplaySettings() {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    () => DEFAULT_DISPLAY_SETTINGS,
  );

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

  const userPrefersLightTheme = displaySettings.theme === "light";
  const preferenceToggleTheme: PreferenceToggleTheme = userPrefersLightTheme
    ? "light"
    : "dark";

  return {
    displaySettings,
    updateDisplaySettings,
    userPrefersLightTheme,
    preferenceToggleTheme,
  } as const;
}
