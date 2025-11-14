"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  peerSignalingController,
  type PeerSignalingController,
  type PeerSignalingRole,
  type PeerSignalingSnapshot,
} from "@/lib/messaging-transport";

export type PeerSignalingStatus =
  | "idle"
  | "hosting"
  | "awaiting-answer"
  | "awaiting-invite"
  | "answering"
  | "ready"
  | "connected"
  | "error";

const deriveStatus = (snapshot: PeerSignalingSnapshot): PeerSignalingStatus => {
  if (snapshot.error) return "error";
  if (snapshot.connected) return "connected";

  if (snapshot.role === "host") {
    if (!snapshot.localInvite) return "hosting";
    if (snapshot.awaitingAnswer) return "awaiting-answer";
    if (snapshot.remoteAnswer) return "ready";
    return "hosting";
  }

  if (snapshot.role === "guest") {
    if (snapshot.awaitingOffer) return "awaiting-invite";
    if (!snapshot.localAnswer) return "answering";
    return "ready";
  }

  return "idle";
};

const sequenceExpiration = (
  controller: PeerSignalingController,
  expires: { inviteExpiresAt: number | null; answerExpiresAt: number | null },
) => {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const timers: number[] = [];
  const now = Date.now();

  if (expires.inviteExpiresAt) {
    const remaining = expires.inviteExpiresAt - now;
    if (remaining <= 0) {
      controller.expireLocalInvite();
    } else {
      timers.push(window.setTimeout(() => controller.expireLocalInvite(), remaining));
    }
  }

  if (expires.answerExpiresAt) {
    const remaining = expires.answerExpiresAt - now;
    if (remaining <= 0) {
      controller.expireLocalAnswer();
    } else {
      timers.push(window.setTimeout(() => controller.expireLocalAnswer(), remaining));
    }
  }

  return () => {
    timers.forEach((timer) => window.clearTimeout(timer));
  };
};

type PeerSignalingOptions = {
  conversationId?: string | null;
  viewerId?: string | null;
};

type RemoteTokenPayload = {
  token: string;
  kind: "offer" | "answer";
  fromRole: PeerSignalingRole;
  sessionId: string;
  createdAt: number;
};

const POLL_INTERVAL_MS = 3_000;
const COUNTDOWN_INTERVAL_MS = 1_000;

const scheduleMicrotask =
  typeof queueMicrotask === "function"
    ? queueMicrotask
    : (callback: () => void) => {
        Promise.resolve()
          .then(callback)
          .catch(() => undefined);
      };

function useRemainingTime(target: number | null) {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || target == null) {
      scheduleMicrotask(() => setRemaining(null));
      return () => undefined;
    }

    const update = () => setRemaining(Math.max(0, target - Date.now()));
    update();
    const timer = window.setInterval(update, COUNTDOWN_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [target]);

  return remaining;
}

export const deriveShouldInitializeTransport = (
  controllerReady: boolean,
  snapshot: PeerSignalingSnapshot,
) => {
  if (!controllerReady) {
    return false;
  }

  if (snapshot.role === "guest") {
    return Boolean(snapshot.remoteInvite);
  }

  return Boolean(snapshot.role);
};

export function usePeerSignaling(options?: PeerSignalingOptions) {
  const conversationId = options?.conversationId ?? null;
  const viewerId = options?.viewerId ?? null;
  const controller = peerSignalingController;
  const [snapshot, setSnapshot] = useState<PeerSignalingSnapshot>(
    controller.getSnapshot(),
  );
  const [status, setStatus] = useState<PeerSignalingStatus>(() =>
    deriveStatus(controller.getSnapshot()),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  const publishedTokensRef = useRef<{ offer: string | null; answer: string | null }>({
    offer: null,
    answer: null,
  });
  const remoteTokensRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    publishedTokensRef.current.offer = null;
    publishedTokensRef.current.answer = null;
  }, [conversationId, viewerId]);

  useEffect(() => {
    remoteTokensRef.current.clear();
  }, [conversationId, snapshot.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!conversationId || !viewerId || !snapshot.role) {
      return;
    }

    const publishToken = async (kind: "offer" | "answer", token: string) => {
      try {
        await fetch(`/api/peer-signaling/${conversationId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            viewerId,
            sessionId: snapshot.sessionId,
            role: snapshot.role,
            kind,
            token,
          }),
        });
      } catch (error) {
        console.error("Failed to publish peer signaling token", error);
      }
    };

    const ensurePublished = (kind: "offer" | "answer", value: string | null) => {
      if (!value) return;
      if (publishedTokensRef.current[kind] === value) {
        return;
      }
      publishedTokensRef.current[kind] = value;
      void publishToken(kind, value);
    };

    ensurePublished("offer", snapshot.localOfferToken);
    ensurePublished("answer", snapshot.localAnswerToken);

    if (!snapshot.localOfferToken) {
      publishedTokensRef.current.offer = null;
    }

    if (!snapshot.localAnswerToken) {
      publishedTokensRef.current.answer = null;
    }
  }, [conversationId, snapshot.localAnswerToken, snapshot.localOfferToken, snapshot.role, snapshot.sessionId, viewerId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!conversationId || !viewerId || !snapshot.role) {
      return;
    }

    const handlePayload = (payload: RemoteTokenPayload) => {
      if (!payload?.token) {
        return;
      }
      const key = `${payload.kind}:${payload.token}`;
      if (remoteTokensRef.current.has(key)) {
        return;
      }
      remoteTokensRef.current.add(key);

      if (payload.kind === "offer") {
        void controller.setRemoteInvite(payload.token).catch((error) => {
          console.error("Failed to apply remote invite token", error);
        });
      } else if (payload.kind === "answer") {
        void controller.setRemoteAnswer(payload.token).catch((error) => {
          console.error("Failed to apply remote answer token", error);
        });
      }
    };

    const params = new URLSearchParams({
      role: snapshot.role,
      viewerId,
    });
    if (snapshot.sessionId) {
      params.set("sessionId", snapshot.sessionId);
    }
    const baseUrl = `/api/peer-signaling/${conversationId}?${params.toString()}`;

    if (typeof window.EventSource === "function") {
      const source = new window.EventSource(baseUrl);
      const tokenListener = (event: MessageEvent) => {
        try {
          const payload = JSON.parse(event.data ?? "{}") as RemoteTokenPayload;
          handlePayload(payload);
        } catch (error) {
          console.error("Failed to parse remote signaling token", error);
        }
      };

      source.addEventListener("token", tokenListener as EventListener);

      return () => {
        source.removeEventListener("token", tokenListener as EventListener);
        source.close();
      };
    }

    const abortController = new AbortController();

    const poll = async () => {
      while (!abortController.signal.aborted) {
        try {
          const response = await fetch(`${baseUrl}&mode=poll`, {
            signal: abortController.signal,
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              tokens?: RemoteTokenPayload[];
            };
            payload.tokens?.forEach((token) => handlePayload(token));
          }
        } catch (error) {
          if (!abortController.signal.aborted) {
            console.error("Failed to poll peer signaling tokens", error);
          }
        }

        await new Promise((resolve) => {
          setTimeout(resolve, POLL_INTERVAL_MS);
        });
      }
    };

    void poll();

    return () => {
      abortController.abort();
    };
  }, [conversationId, controller, snapshot.role, snapshot.sessionId, viewerId]);

  useEffect(() => {
    setStatus(deriveStatus(snapshot));
  }, [snapshot]);

  const { inviteExpiresAt, answerExpiresAt } = snapshot;

  useEffect(
    () =>
      sequenceExpiration(controller, {
        inviteExpiresAt,
        answerExpiresAt,
      }),
    [controller, inviteExpiresAt, answerExpiresAt],
  );

  const dependencies = useMemo(
    () => controller.createDependencies(),
    [controller],
  );

  const selectRole = useCallback(
    (role: PeerSignalingRole) => {
      controller.setRole(role);
    },
    [controller],
  );

  const reset = useCallback(() => {
    controller.clear();
  }, [controller]);

  const exit = useCallback(() => {
    controller.setRole(null);
  }, [controller]);

  const applyRemoteInvite = useCallback(
    async (token: string) => {
      await controller.setRemoteInvite(token);
    },
    [controller],
  );

  const applyRemoteAnswer = useCallback(
    async (token: string) => {
      await controller.setRemoteAnswer(token);
    },
    [controller],
  );

  const shouldInitialize = useMemo(
    () => deriveShouldInitializeTransport(controller.shouldInitialize(), snapshot),
    [controller, snapshot],
  );

  const inviteExpiresIn = useRemainingTime(snapshot.inviteExpiresAt);
  const answerExpiresIn = useRemainingTime(snapshot.answerExpiresAt);

  return {
    controller,
    snapshot,
    status,
    dependencies,
    selectRole,
    reset,
    exit,
    applyRemoteInvite,
    applyRemoteAnswer,
    shouldInitialize,
    inviteExpiresIn,
    answerExpiresIn,
  } as const;
}
