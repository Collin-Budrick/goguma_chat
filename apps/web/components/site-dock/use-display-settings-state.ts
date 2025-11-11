"use client";

import { useEffect, useState } from "react";

import {
  type DisplaySettings,
  DISPLAY_SETTINGS_EVENT,
  DEFAULT_DISPLAY_SETTINGS,
  loadDisplaySettings,
} from "@/lib/display-settings";

export const useDisplaySettingsState = () => {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    () => DEFAULT_DISPLAY_SETTINGS,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    setDisplaySettings(loadDisplaySettings());

    const handleDisplayChange = (event: Event) => {
      const detail = (event as CustomEvent<DisplaySettings>).detail;
      if (!detail) return;

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

    window.addEventListener(DISPLAY_SETTINGS_EVENT, handleDisplayChange);
    return () => {
      window.removeEventListener(DISPLAY_SETTINGS_EVENT, handleDisplayChange);
    };
  }, []);

  return [displaySettings, setDisplaySettings] as const;
};
