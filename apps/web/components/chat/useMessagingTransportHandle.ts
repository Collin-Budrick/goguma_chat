"use client";

import { useEffect, useState } from "react";

import {
  initializeMessagingTransport,
  type TransportHandle,
} from "@/lib/messaging-transport";

export function useMessagingTransportHandle() {
  const [transport, setTransport] = useState<TransportHandle | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const instance = initializeMessagingTransport();
    let cancelled = false;

    const run = async () => {
      try {
        await instance.whenReady();
        if (cancelled) return;
        setTransport(instance.transport ?? null);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to initialize messaging transport", error);
        setTransport(null);
      }
    };

    void run();

    return () => {
      cancelled = true;
      setTransport(null);
      void instance.teardown();
    };
  }, []);

  return transport;
}
