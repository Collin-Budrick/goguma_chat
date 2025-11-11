import { useEffect, useRef, type RefObject } from "react";

export function usePreferencePanel({
  open,
  pathname,
  onClose,
  panelRef,
}: {
  open: boolean;
  pathname: string;
  onClose: () => void;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!panelRef.current) return;
      if (!panelRef.current.contains(event.target as Node)) {
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

  const previousPathnameRef = useRef(pathname);

  useEffect(() => {
    if (!open) {
      previousPathnameRef.current = pathname;
      return;
    }

    if (previousPathnameRef.current === pathname) return;

    const frame = requestAnimationFrame(onClose);
    previousPathnameRef.current = pathname;
    return () => cancelAnimationFrame(frame);
  }, [open, pathname, onClose]);
}
