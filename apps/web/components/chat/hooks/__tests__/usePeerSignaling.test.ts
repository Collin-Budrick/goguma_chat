import { describe, expect, it } from "bun:test";

import { deriveShouldInitializeTransport } from "../usePeerSignaling";
import type { PeerSignalingSnapshot } from "../../../../lib/messaging-transport";

const baseSnapshot: PeerSignalingSnapshot = {
  role: null,
  sessionId: "session",
  localInvite: null,
  localAnswer: null,
  localOfferToken: null,
  localAnswerToken: null,
  localOfferCreatedAt: null,
  localAnswerCreatedAt: null,
  remoteInvite: null,
  remoteAnswer: null,
  awaitingOffer: false,
  awaitingAnswer: false,
  connected: false,
  error: null,
  inviteExpiresAt: null,
  answerExpiresAt: null,
  lastUpdated: null,
};

const createSnapshot = (overrides: Partial<PeerSignalingSnapshot>) => ({
  ...baseSnapshot,
  ...overrides,
});

describe("deriveShouldInitializeTransport", () => {
  it("allows host to initialize even without a remote answer", () => {
    const snapshot = createSnapshot({
      role: "host",
      remoteAnswer: null,
    });

    expect(deriveShouldInitializeTransport(true, snapshot)).toBe(true);
  });

  it("returns false while the guest is missing a remote invite", () => {
    const snapshot = createSnapshot({
      role: "guest",
      remoteInvite: null,
    });

    expect(deriveShouldInitializeTransport(true, snapshot)).toBe(false);
  });

  it("allows the guest to initialize once a remote invite exists", () => {
    const snapshot = createSnapshot({
      role: "guest",
      remoteInvite: "invite-token",
    });

    expect(deriveShouldInitializeTransport(true, snapshot)).toBe(true);
  });

  it("returns false when the controller is not ready even if the role is set", () => {
    const snapshot = createSnapshot({ role: "host" });

    expect(deriveShouldInitializeTransport(false, snapshot)).toBe(false);
  });
});
