"use client";

import { useEffect, useRef, type RefObject } from "react";

export type PreferencePanelOptions = {
  open: boolean;
  pathname: string;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
};

export const usePreferencePanel = ({
  open,
  pathname,
  onClose,
  panelRef,
}: PreferencePanelOptions) => {
  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (!panel.contains(event.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose, panelRef]);

  useEffect(() => {
    if (!open) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current === pathname) return;

    const frame = requestAnimationFrame(() => onClose());
    previousPathnameRef.current = pathname;
    return () => cancelAnimationFrame(frame);
  }, [open, pathname, onClose]);
};
