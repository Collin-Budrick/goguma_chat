"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  initializeMessagingTransport,
  type TransportHandle,
  type TransportState,
} from "@/lib/messaging-transport";
import { usePeerSignaling } from "./hooks/usePeerSignaling";

type MessagingTransportStatus = {
  transport: TransportHandle | null;
  state: TransportState;
  lastDegradedAt: number | null;
  lastRecoveredAt: number | null;
  lastError: Error | null;
  restart: () => Promise<void>;
};

const toError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value));

export function useMessagingTransportHandle(): MessagingTransportStatus {
  const [transport, setTransport] = useState<TransportHandle | null>(null);
  const [state, setState] = useState<TransportState>("idle");
  const [lastDegradedAt, setLastDegradedAt] = useState<number | null>(null);
  const [lastRecoveredAt, setLastRecoveredAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  const { dependencies, snapshot, controller, shouldInitialize } = usePeerSignaling();

  const instanceRef = useRef<ReturnType<typeof initializeMessagingTransport> | null>(null);
  const transportRef = useRef<TransportHandle | null>(null);
  const stateUnsubscribeRef = useRef<(() => void) | null>(null);
  const errorUnsubscribeRef = useRef<(() => void) | null>(null);
  const lastDegradedRef = useRef<number | null>(null);

  const detachListeners = useCallback(() => {
    stateUnsubscribeRef.current?.();
    stateUnsubscribeRef.current = null;
    errorUnsubscribeRef.current?.();
    errorUnsubscribeRef.current = null;
  }, []);

  const attachHandle = useCallback(
    (handle: TransportHandle | null) => {
      detachListeners();
      transportRef.current = handle;
      controller.setActiveTransport(handle);

      if (!handle) {
        setTransport(null);
        setState("idle");
        lastDegradedRef.current = null;
        setLastDegradedAt(null);
        return;
      }

      setTransport(handle);
      setState(handle.state);

      if (handle.state === "connected") {
        controller.markConnected();
      } else if (handle.state === "error" || handle.state === "closed") {
        controller.markDisconnected();
      }

      stateUnsubscribeRef.current = handle.onStateChange((next) => {
        setState(next);

        if (next === "connected") {
          if (lastDegradedRef.current) {
            setLastRecoveredAt(Date.now());
          }
          lastDegradedRef.current = null;
          setLastDegradedAt(null);
          setLastError(null);
          controller.markConnected();
        } else if (next === "degraded") {
          const timestamp = Date.now();
          lastDegradedRef.current = timestamp;
          setLastDegradedAt(timestamp);
        } else if (next === "recovering") {
          if (!lastDegradedRef.current) {
            const timestamp = Date.now();
            lastDegradedRef.current = timestamp;
            setLastDegradedAt(timestamp);
          }
        } else if (next === "error" || next === "closed") {
          controller.markDisconnected();
        }
      });

      errorUnsubscribeRef.current = handle.onError((error) => {
        setLastError(toError(error));
      });
    },
    [controller, detachListeners],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    if (!shouldInitialize) {
      attachHandle(null);
      return () => undefined;
    }

    try {
      window.localStorage.setItem("site-messaging-mode", "progressive");
    } catch {
      // ignore storage failures
    }

    const instance = initializeMessagingTransport({
      dependencies,
      connectOptions: {
        metadata: { peerSessionId: snapshot.sessionId },
      },
    });
    instanceRef.current = instance;
    let cancelled = false;

    const bootstrap = async () => {
      try {
        await instance.whenReady();
        if (cancelled) return;
        attachHandle(instance.transport ?? null);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to initialize messaging transport", error);
        attachHandle(null);
        setState("error");
        setLastError(toError(error));
        controller.markDisconnected();
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      detachListeners();
      attachHandle(null);
      controller.markDisconnected();
      void instance.teardown();
      instanceRef.current = null;
    };
  }, [attachHandle, controller, dependencies, detachListeners, shouldInitialize, snapshot.sessionId]);

  const restart = useCallback(async () => {
    const handle = transportRef.current;
    if (handle) {
      try {
        await handle.disconnect();
      } catch (error) {
        setLastError(toError(error));
      }

      try {
        await handle.connect();
      } catch (error) {
        setLastError(toError(error));
      }
      return;
    }

    const instance = instanceRef.current;
    if (!instance) return;

    try {
      await instance.refresh();
      attachHandle(instance.transport ?? null);
    } catch (error) {
      setLastError(toError(error));
    }
  }, [attachHandle]);

  return useMemo(
    () => ({
      transport,
      state,
      lastDegradedAt,
      lastRecoveredAt,
      lastError,
      restart,
    }),
    [lastDegradedAt, lastError, lastRecoveredAt, restart, state, transport],
  );
}
