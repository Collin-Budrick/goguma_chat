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

type MessagingTransportOptions = {
  conversationId?: string | null;
  viewerId?: string | null;
};

export function useMessagingTransportHandle(
  options?: MessagingTransportOptions,
): MessagingTransportStatus {
  const [transport, setTransport] = useState<TransportHandle | null>(null);
  const [state, setState] = useState<TransportState>("idle");
  const [lastDegradedAt, setLastDegradedAt] = useState<number | null>(null);
  const [lastRecoveredAt, setLastRecoveredAt] = useState<number | null>(null);
  const [lastError, setLastError] = useState<Error | null>(null);

  const conversationId = options?.conversationId ?? null;
  const viewerId = options?.viewerId ?? null;
  const { dependencies, snapshot, controller, shouldInitialize } = usePeerSignaling({
    conversationId,
    viewerId,
  });

  const peerSessionId = useMemo(() => {
    if (!snapshot.role) {
      return snapshot.sessionId ?? null;
    }
    if (snapshot.role === "host") {
      return snapshot.sessionId ?? null;
    }
    if (snapshot.remoteInvite) {
      try {
        const payload = controller.decodeToken(snapshot.remoteInvite);
        if (payload.sessionId) {
          return payload.sessionId;
        }
      } catch (error) {
        console.error("Failed to decode remote invite token", error);
      }
    }
    return snapshot.sessionId ?? null;
  }, [controller, snapshot.remoteInvite, snapshot.role, snapshot.sessionId]);

  const connectOptions = useMemo(
    () => ({
      roomId: conversationId ?? undefined,
      metadata: peerSessionId ? { peerSessionId } : undefined,
    }),
    [conversationId, peerSessionId],
  );

  const instanceRef = useRef<ReturnType<typeof initializeMessagingTransport> | null>(null);
  const transportRef = useRef<TransportHandle | null>(null);
  const stateUnsubscribeRef = useRef<(() => void) | null>(null);
  const errorUnsubscribeRef = useRef<(() => void) | null>(null);
  const lastDegradedRef = useRef<number | null>(null);
  const handshakeUpgradeKeyRef = useRef<string | null>(null);
  const handshakeUpgradeSessionRef = useRef<string | null>(null);

  const scheduleMicrotask = useCallback((callback: () => void) => {
    if (typeof queueMicrotask === "function") {
      queueMicrotask(callback);
      return;
    }

    Promise.resolve()
      .then(callback)
      .catch(() => undefined);
  }, []);

  const detachListeners = useCallback(() => {
    stateUnsubscribeRef.current?.();
    stateUnsubscribeRef.current = null;
    errorUnsubscribeRef.current?.();
    errorUnsubscribeRef.current = null;
  }, []);

  const attachHandle = useCallback(
    (handle: TransportHandle | null, options?: { force?: boolean }) => {
      if (typeof console !== "undefined" && typeof console.info === "function") {
        console.info("[chat:transport] attachHandle invoked", {
          sameHandle: transportRef.current === handle,
          force: Boolean(options?.force),
          incomingState: handle?.state,
        });
      }
      const sameHandle = transportRef.current === handle;

      if (sameHandle && !options?.force) {
        controller.setActiveTransport(handle);
        return;
      }

      detachListeners();
      transportRef.current = handle;
      controller.setActiveTransport(handle);

      if (!handle) {
        setTransport(null);
        setState("idle");
        lastDegradedRef.current = null;
        setLastDegradedAt(null);
        if (typeof console !== "undefined" && typeof console.info === "function") {
          console.info("[chat:transport] detached handle; state reset to idle");
        }
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
        if (typeof console !== "undefined" && typeof console.info === "function") {
          console.info("[chat:transport] handle error event", {
            state: handle.state,
            error,
          });
        }
        setLastError(toError(error));
      });
    },
    [controller, detachListeners],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return () => undefined;
    }

    if (!shouldInitialize || !conversationId) {
      scheduleMicrotask(() => {
        attachHandle(null, { force: true });
      });
      return () => undefined;
    }

    try {
      window.localStorage.setItem("site-messaging-mode", "push");
    } catch {
      // ignore storage failures
    }

    const instance = initializeMessagingTransport({
      dependencies,
      connectOptions,
    });
    instanceRef.current = instance;
    let cancelled = false;

    const attachCurrentHandle = (force?: boolean) => {
      if (typeof console !== "undefined" && typeof console.info === "function") {
        console.info("[chat:transport] attachCurrentHandle", {
          hasTransport: Boolean(instance.transport),
          force,
        });
      }
      if (cancelled) return;
      attachHandle(instance.transport ?? null, force ? { force: true } : undefined);
    };

    const bootstrap = async () => {
      try {
        attachCurrentHandle(true);
        scheduleMicrotask(() => {
          attachCurrentHandle();
        });

        await instance.whenReady();
        attachCurrentHandle(true);
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to initialize messaging transport", error);
        attachHandle(null, { force: true });
        setState("error");
        setLastError(toError(error));
        controller.markDisconnected();
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      detachListeners();
      attachHandle(null, { force: true });
      controller.markDisconnected();
      void instance.teardown();
      instanceRef.current = null;
    };
  }, [
    attachHandle,
    controller,
    dependencies,
    detachListeners,
    scheduleMicrotask,
    shouldInitialize,
    connectOptions,
  ]);

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
      const refreshPromise = instance.refresh();
      scheduleMicrotask(() => {
        attachHandle(instance.transport ?? null);
      });
      await refreshPromise;
      attachHandle(instance.transport ?? null, { force: true });
    } catch (error) {
      setLastError(toError(error));
    }
  }, [attachHandle, scheduleMicrotask]);

  useEffect(() => {
    const sessionId = snapshot.sessionId ?? null;
    if (!snapshot.role) {
      handshakeUpgradeKeyRef.current = null;
      handshakeUpgradeSessionRef.current = null;
      return;
    }

    if (
      sessionId &&
      handshakeUpgradeSessionRef.current &&
      handshakeUpgradeSessionRef.current !== sessionId
    ) {
      handshakeUpgradeKeyRef.current = null;
      handshakeUpgradeSessionRef.current = null;
    }

    const handshakeToken =
      snapshot.role === "host"
        ? snapshot.remoteAnswer ?? null
        : snapshot.localAnswer ?? null;

    if (!handshakeToken) {
      return;
    }

    const key = `${snapshot.sessionId ?? ""}:${handshakeToken}`;

    if (!snapshot.connected) {
      return;
    }

    if (
      handshakeUpgradeKeyRef.current === key ||
      handshakeUpgradeSessionRef.current === sessionId
    ) {
      return;
    }

    handshakeUpgradeKeyRef.current = key;
    handshakeUpgradeSessionRef.current = sessionId;

    if (transportRef.current) {
      scheduleMicrotask(() => {
        void restart();
      });
      return;
    }

    const instance = instanceRef.current;
    if (instance) {
      void instance.refresh();
    }
  }, [
    restart,
    scheduleMicrotask,
    snapshot.connected,
    snapshot.localAnswer,
    snapshot.remoteAnswer,
    snapshot.role,
    snapshot.sessionId,
  ]);

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
