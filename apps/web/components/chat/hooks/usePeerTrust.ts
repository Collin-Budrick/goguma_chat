"use client";

import { useEffect, useMemo, useState } from "react";

import {
  getPeerTrustState,
  markPeerTrusted,
  subscribePeerTrust,
  type PeerTrustState,
} from "@/lib/crypto/session";

const emptyState: PeerTrustState = {
  sessionId: "",
  localFingerprint: null,
  remoteFingerprint: null,
  trusted: false,
  lastRotation: null,
};

export function usePeerTrust(sessionId: string | null) {
  const [state, setState] = useState<PeerTrustState>(emptyState);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;
    if (!sessionId) {
      setState(emptyState);
      setLoading(false);
      return () => undefined;
    }

    setLoading(true);

    void getPeerTrustState(sessionId)
      .then((snapshot) => {
        if (!cancelled) {
          setState(snapshot);
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error("Failed to load peer trust state", error);
        if (!cancelled) {
          setState(emptyState);
          setLoading(false);
        }
      });

    const unsubscribe = subscribePeerTrust((next) => {
      if (next.sessionId === sessionId) {
        setState(next);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [sessionId]);

  const actions = useMemo(
    () => ({
      async trust() {
        if (!sessionId) return;
        await markPeerTrusted(sessionId, true);
      },
      async distrust() {
        if (!sessionId) return;
        await markPeerTrusted(sessionId, false);
      },
    }),
    [sessionId],
  );

  return { state, loading, ...actions } as const;
}
