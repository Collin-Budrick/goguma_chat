"use client";

import { useEffect, useMemo, useState } from "react";

import {
  initializeMessagingTransport,
  type TransportHandle,
} from "@/lib/messaging-transport";
import { useManualSignaling } from "./useManualSignaling";

export function useMessagingTransportHandle() {
  const [transport, setTransport] = useState<TransportHandle | null>(null);
  const { dependencies, state, controller } = useManualSignaling();

  const shouldInitialize = useMemo(() => controller.shouldInitialize(), [
    controller,
    state.role,
    state.remoteOfferToken,
    state.sessionId,
  ]);

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
  }, [controller, dependencies, shouldInitialize, state.sessionId]);

  return transport;
}
