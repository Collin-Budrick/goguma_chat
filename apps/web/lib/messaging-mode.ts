"use client";

export type MessagingMode = "udp" | "progressive";

const STORAGE_KEY = "site-messaging-mode";
export const MESSAGING_MODE_EVENT = "site-messaging-mode-change";
export const DEFAULT_MESSAGING_MODE: MessagingMode = "progressive";

const isMessagingMode = (value: unknown): value is MessagingMode =>
  value === "udp" || value === "progressive";

export function loadMessagingMode(): MessagingMode {
  if (typeof window === "undefined") {
    return DEFAULT_MESSAGING_MODE;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MESSAGING_MODE;
    return isMessagingMode(raw) ? raw : DEFAULT_MESSAGING_MODE;
  } catch {
    return DEFAULT_MESSAGING_MODE;
  }
}

export function persistMessagingMode(mode: MessagingMode) {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // ignore storage failures
  }

  const event = new CustomEvent<MessagingMode>(MESSAGING_MODE_EVENT, {
    detail: mode,
  });

  window.setTimeout(() => window.dispatchEvent(event), 0);
}
