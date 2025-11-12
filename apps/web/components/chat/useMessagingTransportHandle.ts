"use client";

import { useEffect, useState } from "react";

import {
  initializeMessagingTransport,
  type TransportHandle,
} from "@/lib/messaging-transport";
import { usePeerSignaling } from "./hooks/usePeerSignaling";

export function useMessagingTransportHandle() {
  const [transport, setTransport] = useState<TransportHandle | null>(null);
  const { dependencies, snapshot, controller, shouldInitialize } = usePeerSignaling();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!shouldInitialize) {
      setTransport(null);
      return;
    }

    try {
      window.localStorage.setItem("site-messaging-mode", "progressive");
    } catch {
      // ignore storage failures
    }

    const instance = initializeMessagingTransport({ dependencies });
    let cancelled = false;

    const run = async () => {
      try {
        await instance.whenReady();
        if (cancelled) return;
        setTransport(instance.transport ?? null);
        controller.markConnected();
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to initialize messaging transport", error);
        setTransport(null);
        controller.markDisconnected();
      }
    };

    void run();

    return () => {
      cancelled = true;
      setTransport(null);
      controller.markDisconnected();
      void instance.teardown();
    };
  }, [controller, dependencies, shouldInitialize, snapshot.sessionId]);

  return transport;
}
