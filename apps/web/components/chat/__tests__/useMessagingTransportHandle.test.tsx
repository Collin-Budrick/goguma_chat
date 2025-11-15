import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import type {
  PeerSignalingSnapshot,
  TransportHandle,
} from "@/lib/messaging-transport";

const flushMicrotasks = () => new Promise((resolve) => queueMicrotask(resolve));
const flushEffects = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

const baseSnapshot: PeerSignalingSnapshot = {
  role: "host",
  sessionId: "session-id",
  localInvite: null,
  localAnswer: null,
  localOfferToken: null,
  localAnswerToken: null,
  localOfferCreatedAt: null,
  localAnswerCreatedAt: null,
  remoteInvite: null,
  remoteAnswer: "handshake-token-1",
  awaitingOffer: false,
  awaitingAnswer: false,
  connected: true,
  error: null,
  inviteExpiresAt: null,
  answerExpiresAt: null,
  lastUpdated: null,
};

(globalThis as { window?: Window }).window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  dispatchEvent: () => true,
  setTimeout: setTimeout.bind(globalThis),
  clearTimeout: clearTimeout.bind(globalThis),
  localStorage: {
    storage: new Map<string, string>(),
    getItem(key: string) {
      return this.storage.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      this.storage.set(key, value);
    },
    removeItem(key: string) {
      this.storage.delete(key);
    },
  },
} as unknown as Window;

(globalThis as { navigator?: Navigator }).navigator = {} as Navigator;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let snapshot: PeerSignalingSnapshot = { ...baseSnapshot };
const subscribers = new Set<() => void>();

const updateSnapshot = (next: Partial<PeerSignalingSnapshot>) => {
  snapshot = { ...snapshot, ...next };
  subscribers.forEach((listener) => listener());
};

const controller = {
  decodeToken: mock((token: string) => ({ token })),
  setActiveTransport: mock(() => {}),
  markConnected: mock(() => {}),
  markDisconnected: mock(() => {}),
};

const connect = mock(async () => {});
const disconnect = mock(async () => {});
const transportHandle: TransportHandle = {
  mode: "progressive",
  state: "connected",
  ready: Promise.resolve(),
  connect,
  disconnect,
  send: async () => {},
  onMessage: () => () => {},
  onStateChange: () => () => {},
  onError: () => () => {},
};

const refresh = mock(async () => {});
const whenReady = mock(async () => {});

mock.module("@/lib/messaging-transport", () => ({
  initializeMessagingTransport: () => ({
    transport: transportHandle,
    whenReady,
    refresh,
    teardown: async () => {},
  }),
}));

mock.module("../hooks/usePeerSignaling", () => ({
  usePeerSignaling: () => {
    const currentSnapshot = React.useSyncExternalStore(
      (listener) => {
        subscribers.add(listener);
        return () => subscribers.delete(listener);
      },
      () => snapshot,
    );

    return {
      dependencies: {},
      snapshot: currentSnapshot,
      controller,
      shouldInitialize: true,
    };
  },
}));

const { useMessagingTransportHandle } = await import("../useMessagingTransportHandle");

describe("useMessagingTransportHandle", () => {
  beforeEach(() => {
    snapshot = { ...baseSnapshot };
    connect.mockReset();
    disconnect.mockReset();
    refresh.mockReset();
    whenReady.mockReset();
  });

  afterEach(() => {
    subscribers.clear();
  });

  it("does not restart when the handshake token is unchanged after a transient disconnect", async () => {
    function Harness() {
      useMessagingTransportHandle();
      return null;
    }

    await act(async () => {
      TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    const baselineDisconnects = disconnect.mock.calls.length;
    const baselineConnects = connect.mock.calls.length;

    await act(async () => {
      updateSnapshot({ connected: false });
      await flushEffects();
      await flushMicrotasks();
    });

    await act(async () => {
      updateSnapshot({ connected: true });
      await flushEffects();
      await flushMicrotasks();
    });

    expect(disconnect.mock.calls.length).toBe(baselineDisconnects);
    expect(connect.mock.calls.length).toBe(baselineConnects);

    await act(async () => {
      updateSnapshot({ remoteAnswer: "handshake-token-2" });
      await flushEffects();
      await flushMicrotasks();
      await flushMicrotasks();
    });

    expect(disconnect.mock.calls.length).toBe(baselineDisconnects + 1);
    expect(connect.mock.calls.length).toBe(baselineConnects + 1);
  });
});
