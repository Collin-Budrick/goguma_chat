import { useEffect, useState } from "react";

import {
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_EVENT,
  loadDisplaySettings,
  type DisplaySettings,
} from "@/lib/display-settings";

export function useDisplaySettingsState() {
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

  return [displaySettings, setDisplaySettings] as const;
}
