"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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

const scheduleExpiration = (
  snapshot: PeerSignalingSnapshot,
  controller: PeerSignalingController,
) => {
  if (typeof window === "undefined") return () => undefined;

  const timers: number[] = [];
  const now = Date.now();

  if (snapshot.inviteExpiresAt) {
    const remaining = snapshot.inviteExpiresAt - now;
    if (remaining <= 0) {
      controller.expireLocalInvite();
    } else {
      timers.push(window.setTimeout(() => controller.expireLocalInvite(), remaining));
    }
  }

  if (snapshot.answerExpiresAt) {
    const remaining = snapshot.answerExpiresAt - now;
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

export function usePeerSignaling() {
  const controller = peerSignalingController;
  const [snapshot, setSnapshot] = useState<PeerSignalingSnapshot>(
    controller.getSnapshot(),
  );
  const [status, setStatus] = useState<PeerSignalingStatus>(() =>
    deriveStatus(controller.getSnapshot()),
  );

  useEffect(() => controller.subscribe(setSnapshot), [controller]);

  useEffect(() => {
    setStatus(deriveStatus(snapshot));
  }, [snapshot]);

  useEffect(
    () => scheduleExpiration(snapshot, controller),
    [controller, snapshot.inviteExpiresAt, snapshot.answerExpiresAt],
  );

  const dependencies = useMemo(
    () => controller.createDependencies(),
    [controller, snapshot.sessionId],
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
    () => controller.shouldInitialize(),
    [controller, snapshot.role, snapshot.remoteInvite, snapshot.sessionId],
  );

  const inviteExpiresIn = useMemo(() => {
    if (!snapshot.inviteExpiresAt) return null;
    return Math.max(0, snapshot.inviteExpiresAt - Date.now());
  }, [snapshot.inviteExpiresAt]);

  const answerExpiresIn = useMemo(() => {
    if (!snapshot.answerExpiresAt) return null;
    return Math.max(0, snapshot.answerExpiresAt - Date.now());
  }, [snapshot.answerExpiresAt]);

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
