"use client";

import {
  type MessagingMode,
  MESSAGING_MODE_EVENT,
  loadMessagingMode,
} from "./messaging-mode";

export type TransportHandle = {
  mode: MessagingMode;
  disconnect: () => void;
};

type TransportFactory = () => TransportHandle;

const udpTransport: TransportFactory = () => ({
  mode: "udp",
  disconnect: () => {
    // Placeholder for UDP teardown logic
  },
});

const progressiveTransport: TransportFactory = () => ({
  mode: "progressive",
  disconnect: () => {
    // Placeholder for WebRTC/WebTransport teardown logic
  },
});

const getFactoryForMode = (mode: MessagingMode): TransportFactory =>
  mode === "udp" ? udpTransport : progressiveTransport;

export function initializeMessagingTransport(options: {
  onModeChange?: (mode: MessagingMode) => void;
} = {}) {
  let currentMode = loadMessagingMode();
  let handle = getFactoryForMode(currentMode)();
  options.onModeChange?.(currentMode);

  const listener = (event: Event) => {
    const nextMode = (event as CustomEvent<MessagingMode>).detail;
    if (nextMode === currentMode) return;

    handle.disconnect();
    currentMode = nextMode;
    handle = getFactoryForMode(currentMode)();
    options.onModeChange?.(currentMode);
  };

  if (typeof window !== "undefined") {
    window.addEventListener(MESSAGING_MODE_EVENT, listener);
  }

  const teardown = () => {
    handle.disconnect();
    if (typeof window !== "undefined") {
      window.removeEventListener(MESSAGING_MODE_EVENT, listener);
    }
  };

  return {
    get mode() {
      return currentMode;
    },
    get transport() {
      return handle;
    },
    refresh() {
      const nextMode = loadMessagingMode();
      if (nextMode !== currentMode) {
        listener(new CustomEvent<MessagingMode>(MESSAGING_MODE_EVENT, { detail: nextMode }));
      }
    },
    teardown,
  };
}
