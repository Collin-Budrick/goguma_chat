"use client";

import {
  type MessagingMode,
  MESSAGING_MODE_EVENT,
  loadMessagingMode,
} from "./messaging-mode";
import type { PeerHandshakeFrame, PeerPresenceUpdate } from "./messaging-schema";
import {
  createPeerCryptoSession,
  type PeerCryptoSession,
} from "./crypto/session";

export type TransportMessage =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Blob;

export type TransportState =
  | "idle"
  | "connecting"
  | "connected"
  | "degraded"
  | "recovering"
  | "closed"
  | "error";

export type TransportConnectOptions = {
  roomId?: string;
  url?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export type TransportHandle = {
  readonly mode: MessagingMode;
  readonly state: TransportState;
  readonly ready: Promise<void>;
  connect: (options?: TransportConnectOptions) => Promise<void>;
  disconnect: () => Promise<void>;
  send: (payload: TransportMessage) => Promise<void>;
  onMessage: (listener: (payload: TransportMessage) => void) => () => void;
  onStateChange: (listener: (state: TransportState) => void) => () => void;
  onError: (listener: (error: Error) => void) => () => void;
};

type Listener<T> = (value: T) => void;

const createEmitter = <T>() => {
  const listeners = new Set<Listener<T>>();
  return {
    emit(value: T) {
      listeners.forEach((listener) => listener(value));
    },
    subscribe(listener: Listener<T>) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

const PEER_SESSION_DEFAULT_ID = "default-peer-session";

const resolvePeerSessionId = (options?: TransportConnectOptions): string => {
  const metadata = options?.metadata as { peerSessionId?: unknown } | undefined;
  const candidate = metadata?.peerSessionId;
  if (typeof candidate === "string" && candidate.trim()) {
    return candidate.trim();
  }
  if (typeof options?.roomId === "string" && options.roomId.trim()) {
    return `room:${options.roomId.trim()}`;
  }
  return PEER_SESSION_DEFAULT_ID;
};

export type PeerPresenceListener = (update: PeerPresenceUpdate) => void;

export const PEER_PRESENCE_EVENT = "messaging:peer-presence";

const presenceEmitter = createEmitter<PeerPresenceUpdate>();

export const emitPeerPresence = (update: PeerPresenceUpdate) => {
  presenceEmitter.emit(update);
  if (typeof window !== "undefined") {
    const event = new CustomEvent<PeerPresenceUpdate>(PEER_PRESENCE_EVENT, {
      detail: update,
    });
    window.dispatchEvent(event);
  }
};

export const onPeerPresence = (listener: PeerPresenceListener) =>
  presenceEmitter.subscribe(listener);

type DriverConnection = {
  send: (payload: TransportMessage) => Promise<void>;
  close?: () => Promise<void>;
};

type DriverStartOptions = {
  signal: AbortSignal;
  options?: TransportConnectOptions;
  emitMessage: (payload: TransportMessage) => void;
  emitState: (state: TransportState) => void;
  emitError: (error: Error) => void;
};

type TransportDriver = {
  start: (options: DriverStartOptions) => Promise<DriverConnection>;
};

const createAbortError = () =>
  typeof DOMException !== "undefined"
    ? new DOMException("The operation was aborted.", "AbortError")
    : new Error("The operation was aborted.");

const normalizeError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

const createTransportHandle = (
  mode: MessagingMode,
  driver: TransportDriver,
): TransportHandle => {
  const createNotConnectedError = () => new Error("Transport is not connected");

  const logDebug = (message: string, meta?: unknown) => {
    if (typeof console === "undefined" || typeof console.debug !== "function") {
      return;
    }
    if (meta !== undefined) {
      console.debug(`[transport:${mode}] ${message}`, meta);
      return;
    }
    console.debug(`[transport:${mode}] ${message}`);
  };

  let state: TransportState = "idle";
  let connection: DriverConnection | null = null;
  let rawConnection: DriverConnection | null = null;
  let cryptoSession: PeerCryptoSession | null = null;
  let controller = new AbortController();
  let lastConnectOptions: TransportConnectOptions | undefined;
  let readyResolve: (() => void) | undefined;
  let readyReject: ((reason: unknown) => void) | undefined;
  let readySettled = false;
  const readyPromise: Promise<void> = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  type PendingSendEntry = {
    payload: TransportMessage;
    resolve: () => void;
    reject: (error: Error) => void;
  };

  const pendingSends: PendingSendEntry[] = [];

  const enqueuePendingSend = (payload: TransportMessage) =>
    new Promise<void>((resolve, reject) => {
      pendingSends.push({ payload, resolve, reject });
    });

  const drainPendingSends = async () => {
    if (!connection || pendingSends.length === 0) {
      return;
    }

    const activeConnection = connection;
    const queued = pendingSends.splice(0);

    for (const entry of queued) {
      if (!activeConnection) {
        entry.reject(createNotConnectedError());
        continue;
      }
      try {
        await activeConnection.send(entry.payload);
        entry.resolve();
      } catch (error) {
        entry.reject(normalizeError(error));
      }
    }
  };

  const rejectPendingSends = (error: Error) => {
    if (!pendingSends.length) {
      return;
    }

    const normalized = normalizeError(error);
    while (pendingSends.length) {
      pendingSends.shift()?.reject(normalized);
    }
  };

  const messageEmitter = createEmitter<TransportMessage>();
  const stateEmitter = createEmitter<TransportState>();
  const errorEmitter = createEmitter<Error>();

  const updateState = (next: TransportState) => {
    logDebug("state change", next);
    state = next;
    stateEmitter.emit(next);
  };

  const fulfillReady = () => {
    if (!readySettled && readyResolve) {
      readySettled = true;
      readyResolve();
    }
  };

  const rejectReady = (reason: unknown) => {
    if (!readySettled && readyReject) {
      readySettled = true;
      readyReject(reason);
    }
  };

  const connect: TransportHandle["connect"] = async (options) => {
    if (state === "connected" && !options) {
      logDebug("connect invoked but already connected, ignoring");
      return;
    }

    if (controller.signal.aborted) {
      controller = new AbortController();
    }

    const resolvedOptions = options ?? lastConnectOptions;
    if (options || (!lastConnectOptions && resolvedOptions)) {
      lastConnectOptions = resolvedOptions;
    }

    const nextState =
      state === "degraded" || state === "recovering"
        ? "recovering"
        : "connecting";
    logDebug("connect invoked", {
      options: resolvedOptions,
      previousState: state,
      nextState,
    });
    updateState(nextState);

    try {
      const cryptoId = resolvePeerSessionId(resolvedOptions);
      cryptoSession = await createPeerCryptoSession({
        sessionId: cryptoId,
        onPlaintext: (payload) => messageEmitter.emit(payload),
        onError: (error) => errorEmitter.emit(error),
      });

      logDebug("starting driver", resolvedOptions);
      connection = await driver.start({
        signal: controller.signal,
        options: resolvedOptions,
        emitMessage: (payload) => {
          if (cryptoSession) {
            void cryptoSession.receive(payload);
          }
        },
        emitState: updateState,
        emitError: (error) => errorEmitter.emit(error),
      });

      const baseConnection = connection;
      rawConnection = baseConnection;

      if (!cryptoSession) {
        throw new Error("Failed to initialize peer crypto session");
      }

      cryptoSession.attachTransmitter(async (payload) => {
        if (!baseConnection) return;
        await baseConnection.send(payload);
      });

      await cryptoSession.whenReady();

      connection = {
        async send(payload) {
          if (!cryptoSession) {
            throw new Error("Peer crypto session is not available");
          }
          await cryptoSession.send(payload);
        },
        async close() {
          if (baseConnection?.close) {
            await baseConnection.close();
          }
          if (cryptoSession) {
            await cryptoSession.teardown();
          }
        },
      } satisfies DriverConnection;

      if (controller.signal.aborted) {
        throw createAbortError();
      }

      await drainPendingSends();

      updateState("connected");
      fulfillReady();
      logDebug("connected");
    } catch (error) {
      const normalized = normalizeError(error);
      logDebug("connect failed", normalized);
      updateState("error");
      errorEmitter.emit(normalized);
      rejectReady(normalized);
      rejectPendingSends(normalized);
      if (cryptoSession) {
        await cryptoSession.teardown().catch(() => undefined);
      }
      if (rawConnection?.close) {
        await rawConnection.close().catch(() => undefined);
      }
      cryptoSession = null;
      rawConnection = null;
      throw normalized;
    }
  };

  const disconnect: TransportHandle["disconnect"] = async () => {
    if (state === "closed") return;

    controller.abort();
    const activeConnection = connection;
    connection = null;
    rawConnection = null;
    const activeCrypto = cryptoSession;
    cryptoSession = null;

    try {
      if (activeConnection?.close) {
        await activeConnection.close();
      }
      if (activeCrypto) {
        await activeCrypto.teardown();
      }
    } finally {
      rejectPendingSends(createNotConnectedError());
      updateState("closed");
    }

    // Prepare the handle for a potential reconnect by resetting the controller.
    controller = new AbortController();
  };

  const send: TransportHandle["send"] = async (payload) => {
    if (connection) {
      await connection.send(payload);
      return;
    }

    if (state === "connecting" || state === "recovering") {
      await enqueuePendingSend(payload);
      return;
    }

    throw createNotConnectedError();
  };

  return {
    mode,
    get state() {
      return state;
    },
    get ready() {
      return readyPromise;
    },
    connect,
    disconnect,
    send,
    onMessage(listener) {
      return messageEmitter.subscribe(listener);
    },
    onStateChange(listener) {
      return stateEmitter.subscribe(listener);
    },
    onError(listener) {
      return errorEmitter.subscribe(listener);
    },
  };
};

export class TransportUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransportUnavailableError";
  }
}

export type UDPDatagramSession = {
  send: (payload: TransportMessage) => Promise<void>;
  close?: () => Promise<void> | void;
  readable?: ReadableStream<TransportMessage>;
  writable?: WritableStream<TransportMessage>;
  addEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener?: (type: string, listener: EventListenerOrEventListenerObject) => void;
  onmessage?: (event: { data: TransportMessage }) => void;
  onstatechange?: (event: { state: TransportState | string }) => void;
  onerror?: ((error: unknown) => void) | null;
};

export type UDPConnector = {
  join: (
    options?: (TransportConnectOptions & { signal?: AbortSignal }) | undefined,
  ) => Promise<UDPDatagramSession>;
};

type WebTransportLike = {
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  datagrams?: {
    readable: ReadableStream<Uint8Array>;
    writable: WritableStream<Uint8Array>;
  };
  close: (options?: { closeCode?: number; reason?: string }) => Promise<void>;
};

export type TransportDependencies = {
  udpConnector?: UDPConnector;
  createWebRTC?: (
    options: DriverStartOptions & { dependencies: TransportDependencies }
  ) => Promise<DriverConnection>;
  createWebTransport?: (
    options: DriverStartOptions & { dependencies: TransportDependencies; endpoint?: string }
  ) => Promise<DriverConnection>;
  signaling?: {
    negotiate: (
      offer: RTCSessionDescriptionInit,
      connectOptions?: TransportConnectOptions,
    ) => Promise<RTCSessionDescriptionInit>;
    iceServers?: RTCIceServer[];
  };
  relayLocator?: (context: { attempt: number; reason: string }) =>
    | Promise<RTCIceServer[] | null | undefined>
    | RTCIceServer[]
    | null
    | undefined;
  webTransportEndpoint?: string | ((options?: TransportConnectOptions) => string);
  WebTransportConstructor?: new (url: string) => WebTransportLike;
  textEncoder?: () => TextEncoder;
};

export type PeerSignalingRole = "host" | "guest";

export type PeerSignalingSnapshot = {
  role: PeerSignalingRole | null;
  sessionId: string;
  localInvite: string | null;
  localAnswer: string | null;
  localOfferToken: string | null;
  localAnswerToken: string | null;
  localOfferCreatedAt: number | null;
  localAnswerCreatedAt: number | null;
  remoteInvite: string | null;
  remoteAnswer: string | null;
  awaitingOffer: boolean;
  awaitingAnswer: boolean;
  connected: boolean;
  error: string | null;
  inviteExpiresAt: number | null;
  answerExpiresAt: number | null;
  lastUpdated: number | null;
};

type PeerSignalingListener = (snapshot: PeerSignalingSnapshot) => void;

type PeerSignalingTokenKind = "offer" | "answer";

type PeerSignalingTokenPayload = {
  type: "goguma-peer-invite";
  kind: PeerSignalingTokenKind;
  description: RTCSessionDescriptionInit;
  sessionId: string;
  roomId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

type PeerNegotiationEntry = {
  resolve: (description: RTCSessionDescriptionInit) => void;
  reject: (error: Error) => void;
};

class PeerNegotiationCancelledError extends Error {
  constructor(message = "Peer signaling negotiation cancelled before completion") {
    super(message);
    this.name = "PeerNegotiationCancelledError";
  }
}

const isNegotiationCancelledError = (
  value: unknown,
): value is PeerNegotiationCancelledError => value instanceof PeerNegotiationCancelledError;

type PersistentPeerState = {
  role: PeerSignalingRole | null;
  sessionId: string;
  localInvite: string | null;
  localAnswer: string | null;
  localOfferToken: string | null;
  localAnswerToken: string | null;
  localOfferCreatedAt: number | null;
  localAnswerCreatedAt: number | null;
  remoteInvite: string | null;
  remoteAnswer: string | null;
  awaitingOffer: boolean;
  awaitingAnswer: boolean;
  connected: boolean;
  inviteExpiresAt: number | null;
  answerExpiresAt: number | null;
  lastUpdated: number | null;
};

type HandshakeSignal = {
  handshake: PeerHandshakeFrame["handshake"];
  senderSessionId: string;
  timestamp: number;
};

export const PEER_SIGNALING_STORAGE_KEY = "peer-signaling-state";

const INVITE_TTL_MS = 10 * 60 * 1000;
const PEER_HANDSHAKE_CHANNEL = "goguma-peer-handshake";
const PEER_HANDSHAKE_STORAGE_KEY = "peer-handshake-signal";

const now = () => Date.now();

const encodeBase64 = (value: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(value, "utf-8").toString("base64");
  }
  return window.btoa(unescape(encodeURIComponent(value)));
};

const decodeBase64 = (value: string) => {
  if (typeof window === "undefined") {
    return Buffer.from(value, "base64").toString("utf-8");
  }
  return decodeURIComponent(escape(window.atob(value)));
};

const createSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const snapshotFromPersistentState = (
  persistent: PersistentPeerState | null,
): PeerSignalingSnapshot => ({
  role: persistent?.role ?? null,
  sessionId: persistent?.sessionId ?? createSessionId(),
  localInvite: persistent?.localInvite ?? null,
  localAnswer: persistent?.localAnswer ?? null,
  localOfferToken: persistent?.localOfferToken ?? null,
  localAnswerToken: persistent?.localAnswerToken ?? null,
  localOfferCreatedAt: persistent?.localOfferCreatedAt ?? null,
  localAnswerCreatedAt: persistent?.localAnswerCreatedAt ?? null,
  remoteInvite: persistent?.remoteInvite ?? null,
  remoteAnswer: persistent?.remoteAnswer ?? null,
  awaitingOffer:
    typeof persistent?.awaitingOffer === "boolean"
      ? persistent.awaitingOffer
      : persistent?.role === "guest" && !persistent?.remoteInvite,
  awaitingAnswer: persistent?.awaitingAnswer ?? false,
  connected: persistent?.connected ?? false,
  error: null,
  inviteExpiresAt: persistent?.inviteExpiresAt ?? null,
  answerExpiresAt: persistent?.answerExpiresAt ?? null,
  lastUpdated: persistent?.lastUpdated ?? null,
});

const serializePeerToken = (payload: PeerSignalingTokenPayload) =>
  encodeBase64(JSON.stringify(payload));

const deserializePeerToken = (token: string): PeerSignalingTokenPayload => {
  try {
    const raw = decodeBase64(token.trim());
    const parsed = JSON.parse(raw) as PeerSignalingTokenPayload;
    if (parsed?.type !== "goguma-peer-invite") {
      throw new Error("Invalid peer signaling token");
    }
    if (parsed.kind !== "offer" && parsed.kind !== "answer") {
      throw new Error("Unsupported peer signaling token kind");
    }
    if (!parsed.description || typeof parsed.description.sdp !== "string") {
      throw new Error("Peer signaling token is missing SDP");
    }
    return parsed;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse peer signaling token";
    throw new Error(message);
  }
};

const loadPersistentPeerState = (storageKey: string): PersistentPeerState | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistentPeerState;
    if (!parsed || typeof parsed !== "object") return null;
    const role = parsed.role ?? null;
    const remoteInvite = parsed.remoteInvite ?? null;
    const awaitingOffer =
      typeof parsed.awaitingOffer === "boolean"
        ? parsed.awaitingOffer
        : role === "guest" && !remoteInvite;
    const awaitingAnswer =
      typeof parsed.awaitingAnswer === "boolean" ? parsed.awaitingAnswer : false;

    return {
      role,
      sessionId: parsed.sessionId ?? createSessionId(),
      localInvite: parsed.localInvite ?? null,
      localAnswer: parsed.localAnswer ?? null,
      localOfferToken: parsed.localOfferToken ?? null,
      localAnswerToken: parsed.localAnswerToken ?? null,
      localOfferCreatedAt: parsed.localOfferCreatedAt ?? null,
      localAnswerCreatedAt: parsed.localAnswerCreatedAt ?? null,
      remoteInvite,
      remoteAnswer: parsed.remoteAnswer ?? null,
      awaitingOffer,
      awaitingAnswer,
      connected: Boolean(parsed.connected),
      inviteExpiresAt: parsed.inviteExpiresAt ?? null,
      answerExpiresAt: parsed.answerExpiresAt ?? null,
      lastUpdated: parsed.lastUpdated ?? null,
    } satisfies PersistentPeerState;
  } catch {
    return null;
  }
};

const persistPeerState = (storageKey: string, state: PersistentPeerState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

export type PeerSignalingController = {
  getSnapshot: () => PeerSignalingSnapshot;
  subscribe: (listener: PeerSignalingListener) => () => void;
  setRole: (role: PeerSignalingRole | null) => void;
  setRemoteInvite: (token: string) => Promise<void>;
  setRemoteAnswer: (token: string) => Promise<void>;
  setActiveTransport: (handle: TransportHandle | null) => void;
  clear: () => void;
  markConnected: () => void;
  markDisconnected: () => void;
  shouldInitialize: () => boolean;
  createDependencies: () => TransportDependencies;
  decodeToken: (token: string) => PeerSignalingTokenPayload;
  expireLocalInvite: () => void;
  expireLocalAnswer: () => void;
  hydrateFromStorage: () => void;
};

export const createPeerSignalingController = (
  storageKey: string = PEER_SIGNALING_STORAGE_KEY,
) => {
  const listeners = new Set<PeerSignalingListener>();
  let pendingPersistentState = loadPersistentPeerState(storageKey);
  let hasHydratedPersistentState = false;

  let currentState: PeerSignalingSnapshot = snapshotFromPersistentState(null);

  let pendingNegotiation: PeerNegotiationEntry | null = null;
  let handshakeChannel: BroadcastChannel | null = null;
  let pendingExternalHandshakes: HandshakeSignal[] = [];
  let applyExternalHandshakeSignal: ((signal: HandshakeSignal) => boolean) | null = null;
  const appliedHandshakeTokens = new Set<string>();

  const DEFAULT_HANDSHAKE_RETRY_INTERVAL_MS = 5_000;

  const getHandshakeRetryInterval = () => {
    if (typeof globalThis === "object" && globalThis) {
      const override = (globalThis as {
        __PEER_HANDSHAKE_RETRY_INTERVAL__?: unknown;
      }).__PEER_HANDSHAKE_RETRY_INTERVAL__;
      if (typeof override === "number" && Number.isFinite(override) && override > 0) {
        return override;
      }
    }
    return DEFAULT_HANDSHAKE_RETRY_INTERVAL_MS;
  };

  type HandshakeEntry = {
    handshake: PeerHandshakeFrame["handshake"];
    createdAt: number;
    timeoutId: ReturnType<typeof setTimeout> | null;
    stop: () => boolean;
  };

  let activeTransport: TransportHandle | null = null;
  const pendingHandshakes = new Map<string, HandshakeEntry>();

  const broadcastHandshakeSignal = (handshake: PeerHandshakeFrame["handshake"]) => {
    if (typeof window === "undefined") {
      return;
    }

    const signal: HandshakeSignal = {
      handshake,
      senderSessionId: currentState.sessionId,
      timestamp: Date.now(),
    };

    if (typeof BroadcastChannel !== "undefined") {
      try {
        if (!handshakeChannel) {
          handshakeChannel = new BroadcastChannel(PEER_HANDSHAKE_CHANNEL);
        }
        handshakeChannel.postMessage(signal);
      } catch (error) {
        console.warn("Failed to broadcast handshake via channel", error);
      }
    }

    try {
      window.localStorage.setItem(PEER_HANDSHAKE_STORAGE_KEY, JSON.stringify(signal));
      window.localStorage.removeItem(PEER_HANDSHAKE_STORAGE_KEY);
    } catch {
      // ignore storage failures
    }
  };

  const enqueueExternalHandshake = (signal: HandshakeSignal) => {
    if (!signal?.handshake) {
      return;
    }
    pendingExternalHandshakes.push(signal);
    flushExternalHandshakes();
  };

  const flushExternalHandshakes = () => {
    if (!pendingExternalHandshakes.length || !applyExternalHandshakeSignal) {
      return;
    }

    pendingExternalHandshakes = pendingExternalHandshakes.filter((signal) => {
      const applied = applyExternalHandshakeSignal?.(signal) ?? false;
      return !applied;
    });
  };

  const clearHandshakeEntry = (key: string) => {
    const entry = pendingHandshakes.get(key);
    if (!entry) return;
    if (entry.timeoutId) {
      clearTimeout(entry.timeoutId);
    }
    pendingHandshakes.delete(key);
  };

  const isBootstrappingSendError = (error: unknown) => {
    const normalized = normalizeError(error);
    const message = typeof normalized.message === "string" ? normalized.message : "";
    return message.toLowerCase().includes("not connected");
  };

  const isAbortError = (error: Error) =>
    error.name === "AbortError" || error.message === "The operation was aborted.";

  const getHandshakeExpiration = (entry: HandshakeEntry) => {
    const ttlDeadline = entry.createdAt + INVITE_TTL_MS;
    const stateDeadline =
      entry.handshake.kind === "offer"
        ? currentState.inviteExpiresAt
        : currentState.answerExpiresAt;
    if (typeof stateDeadline === "number") {
      return Math.min(stateDeadline, ttlDeadline);
    }
    return ttlDeadline;
  };

  const hasHandshakeExpired = (entry: HandshakeEntry) => now() >= getHandshakeExpiration(entry);

  const attemptHandshakeSend = async (key: string) => {
    const entry = pendingHandshakes.get(key);
    if (!entry) return;
    entry.timeoutId = null;

    if (entry.stop() || hasHandshakeExpired(entry)) {
      clearHandshakeEntry(key);
      return;
    }

    const transport = activeTransport;
    if (!transport) {
      if (entry.stop() || hasHandshakeExpired(entry)) {
        clearHandshakeEntry(key);
        return;
      }
      entry.timeoutId = setTimeout(() => {
        void attemptHandshakeSend(key);
      }, getHandshakeRetryInterval());
      return;
    }

    const scheduleRetry = (delay: number) => {
      if (entry.stop() || hasHandshakeExpired(entry)) {
        clearHandshakeEntry(key);
        return;
      }
      entry.timeoutId = setTimeout(() => {
        void attemptHandshakeSend(key);
      }, delay);
    };

    try {
      const frame: PeerHandshakeFrame = {
        type: "handshake",
        handshake: entry.handshake,
      };
      await transport.send(JSON.stringify(frame));
    } catch (error) {
      const normalized = normalizeError(error);
      if (isAbortError(normalized)) {
        scheduleRetry(0);
        return;
      }

      const initializingState =
        transport.state === "connecting" || transport.state === "recovering";
      if (initializingState || isBootstrappingSendError(normalized)) {
        scheduleRetry(0);
        return;
      }

      console.error("Failed to send peer handshake frame", normalized);
    }

    scheduleRetry(getHandshakeRetryInterval());
  };

  const evaluateHandshakeQueue = () => {
    pendingHandshakes.forEach((entry, key) => {
      if (entry.stop() || hasHandshakeExpired(entry)) {
        clearHandshakeEntry(key);
        return;
      }
      if (activeTransport && entry.timeoutId) {
        clearTimeout(entry.timeoutId);
        entry.timeoutId = null;
      }
      if (!entry.timeoutId) {
        entry.timeoutId = setTimeout(() => {
          void attemptHandshakeSend(key);
        }, 0);
      }
    });
  };

  const clearPendingHandshakes = () => {
    pendingHandshakes.forEach((entry) => {
      if (entry.timeoutId) {
        clearTimeout(entry.timeoutId);
      }
    });
    pendingHandshakes.clear();
  };

  const queueHandshake = (
    handshake: PeerHandshakeFrame["handshake"],
    stop: () => boolean,
    createdAtOverride?: number | null,
  ) => {
    const key = `${handshake.kind}:${handshake.token}`;
    const existing = pendingHandshakes.get(key);
    if (existing) {
      existing.stop = stop;
      if (typeof createdAtOverride === "number") {
        existing.createdAt = createdAtOverride;
      }
      if (!existing.timeoutId) {
        existing.timeoutId = setTimeout(() => {
          void attemptHandshakeSend(key);
        }, 0);
      }
      return;
    }

    let createdAt = typeof createdAtOverride === "number" ? createdAtOverride : now();
    if (typeof createdAtOverride !== "number") {
      try {
        const payload = deserializePeerToken(handshake.token);
        if (typeof payload.createdAt === "number") {
          createdAt = payload.createdAt;
        }
      } catch {
        // Ignore malformed tokens and fall back to the current timestamp
      }
    }

    pendingHandshakes.set(key, {
      handshake,
      stop,
      createdAt,
      timeoutId: setTimeout(() => {
        void attemptHandshakeSend(key);
      }, 0),
    });

    broadcastHandshakeSignal(handshake);
  };

  type HandshakeReplayEntry = {
    handshake: PeerHandshakeFrame["handshake"];
    stop: () => boolean;
    createdAt: number | null;
  };

  let pendingRehydratedHandshakes: HandshakeReplayEntry[] | null = null;

  const queueRehydratedHandshakes = () => {
    if (!pendingRehydratedHandshakes?.length) {
      pendingRehydratedHandshakes = null;
      return;
    }

    pendingRehydratedHandshakes.forEach((entry) => {
      queueHandshake(entry.handshake, entry.stop, entry.createdAt);
    });
    pendingRehydratedHandshakes = null;
  };

  const prepareHandshakeRehydrate = (snapshot: PeerSignalingSnapshot) => {
    const entries: HandshakeReplayEntry[] = [];

    if (snapshot.localOfferToken && snapshot.awaitingAnswer && !snapshot.remoteAnswer) {
      entries.push({
        handshake: { kind: "offer", token: snapshot.localOfferToken },
        stop: () => !currentState.awaitingAnswer || Boolean(currentState.remoteAnswer),
        createdAt: snapshot.localOfferCreatedAt ?? null,
      });
    }

    if (snapshot.localAnswerToken && !snapshot.connected) {
      entries.push({
        handshake: { kind: "answer", token: snapshot.localAnswerToken },
        stop: () => Boolean(currentState.connected),
        createdAt: snapshot.localAnswerCreatedAt ?? null,
      });
    }

    pendingRehydratedHandshakes = entries.length ? entries : null;
  };

  const notify = () => {
    listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (error) {
        console.error("Peer signaling listener failed", error);
      }
    });
  };

  const commitState = (update: Partial<PeerSignalingSnapshot>) => {
    currentState = { ...currentState, ...update };
    queueRehydratedHandshakes();
    const nextPersistent: PersistentPeerState = {
      role: currentState.role,
      sessionId: currentState.sessionId,
      localInvite: currentState.localInvite,
      localAnswer: currentState.localAnswer,
      localOfferToken: currentState.localOfferToken,
      localAnswerToken: currentState.localAnswerToken,
      localOfferCreatedAt: currentState.localOfferCreatedAt,
      localAnswerCreatedAt: currentState.localAnswerCreatedAt,
      remoteInvite: currentState.remoteInvite,
      remoteAnswer: currentState.remoteAnswer,
      awaitingOffer: currentState.awaitingOffer,
      awaitingAnswer: currentState.awaitingAnswer,
      connected: currentState.connected,
      inviteExpiresAt: currentState.inviteExpiresAt,
      answerExpiresAt: currentState.answerExpiresAt,
      lastUpdated: currentState.lastUpdated,
    };
    persistPeerState(storageKey, nextPersistent);
    evaluateHandshakeQueue();
    notify();
    flushExternalHandshakes();
  };

  const buildHandshakeResetState = (
    role: PeerSignalingRole | null = currentState.role,
  ): Pick<
    PeerSignalingSnapshot,
    | "localInvite"
    | "localAnswer"
    | "localOfferToken"
    | "localAnswerToken"
    | "localOfferCreatedAt"
    | "localAnswerCreatedAt"
    | "remoteInvite"
    | "remoteAnswer"
    | "awaitingOffer"
    | "awaitingAnswer"
    | "inviteExpiresAt"
    | "answerExpiresAt"
  > => ({
    localInvite: null,
    localAnswer: null,
    localOfferToken: null,
    localAnswerToken: null,
    localOfferCreatedAt: null,
    localAnswerCreatedAt: null,
    remoteInvite: null,
    remoteAnswer: null,
    awaitingOffer: role === "guest",
    awaitingAnswer: false,
    inviteExpiresAt: null,
    answerExpiresAt: null,
  });

  const clearAwaitingAnswerState = () => {
    if (
      currentState.remoteAnswer ||
      currentState.awaitingAnswer ||
      currentState.answerExpiresAt
    ) {
      commitState({
        remoteAnswer: null,
        awaitingAnswer: false,
        answerExpiresAt: null,
        lastUpdated: now(),
      });
    }
  };

  const clearAwaitingOfferState = () => {
    if (
      currentState.remoteInvite ||
      currentState.awaitingOffer ||
      currentState.inviteExpiresAt
    ) {
      const awaitingOffer = currentState.role === "guest";
      commitState({
        remoteInvite: null,
        awaitingOffer,
        inviteExpiresAt: null,
        lastUpdated: now(),
      });
    }
  };

  const hydratePersistentState = () => {
    if (hasHydratedPersistentState) {
      return;
    }
    hasHydratedPersistentState = true;

    if (!pendingPersistentState) {
      pendingPersistentState = null;
      return;
    }

    const hydratedSnapshot = snapshotFromPersistentState(pendingPersistentState);
    prepareHandshakeRehydrate(hydratedSnapshot);
    pendingPersistentState = null;
    commitState(hydratedSnapshot);
  };

  const resetNegotiation = (error?: Error) => {
    if (pendingNegotiation) {
      if (error) {
        pendingNegotiation.reject(error);
      } else {
        pendingNegotiation.reject(new PeerNegotiationCancelledError());
      }
    }
    pendingNegotiation = null;
  };

  const ensureSession = () => {
    if (!currentState.sessionId) {
      commitState({ sessionId: createSessionId() });
    }
  };

  const handleOfferCreated = (
    description: RTCSessionDescriptionInit,
    connectOptions?: TransportConnectOptions,
  ) => {
    clearAwaitingAnswerState();
    ensureSession();
    const createdAt = now();
    const token = serializePeerToken({
      type: "goguma-peer-invite",
      kind: "offer",
      description,
      sessionId: currentState.sessionId,
      roomId:
        typeof connectOptions?.roomId === "string" ? connectOptions.roomId : undefined,
      metadata: connectOptions?.metadata,
      createdAt,
    });

    queueHandshake(
      { kind: "offer", token },
      () => !currentState.awaitingAnswer || Boolean(currentState.remoteAnswer),
      createdAt,
    );

    commitState({
      localInvite: "[automatic peer handshake]",
      localOfferToken: token,
      localOfferCreatedAt: createdAt,
      awaitingAnswer: true,
      inviteExpiresAt: now() + INVITE_TTL_MS,
      lastUpdated: now(),
      connected: false,
      error: null,
    });
  };

  const handleAnswerGenerated = (description: RTCSessionDescriptionInit) => {
    clearAwaitingOfferState();
    ensureSession();
    const createdAt = now();
    const token = serializePeerToken({
      type: "goguma-peer-invite",
      kind: "answer",
      description,
      sessionId: currentState.sessionId,
      roomId: undefined,
      metadata: undefined,
      createdAt,
    });

    queueHandshake(
      { kind: "answer", token },
      () => Boolean(currentState.connected),
      createdAt,
    );

    commitState({
      localAnswer: "[automatic peer handshake]",
      localAnswerToken: token,
      localAnswerCreatedAt: createdAt,
      awaitingOffer: false,
      answerExpiresAt: now() + INVITE_TTL_MS,
      lastUpdated: now(),
      error: null,
    });
  };

  const negotiate = async (
    offer: RTCSessionDescriptionInit,
    connectOptions?: TransportConnectOptions,
  ): Promise<RTCSessionDescriptionInit> => {
    handleOfferCreated(offer, connectOptions);

    if (currentState.remoteAnswer) {
      try {
        const payload = deserializePeerToken(currentState.remoteAnswer);
        if (payload.kind === "answer") {
          commitState({ awaitingAnswer: false, error: null });
          pendingNegotiation = null;
          return payload.description;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to parse stored answer";
        commitState({ error: message });
      }
    }

    const negotiationPromise = new Promise<RTCSessionDescriptionInit>(
      (resolve, reject) => {
        pendingNegotiation = { resolve, reject };
      },
    );
    negotiationPromise.catch(() => undefined);

    return negotiationPromise;
  };

  const createDependencies = (): TransportDependencies => {
    const createManualWebRTC: NonNullable<TransportDependencies["createWebRTC"]> = async (
      startOptions,
    ) => {
      const { signal, emitMessage, emitError } = startOptions;

      if (typeof RTCPeerConnection !== "function") {
        throw new TransportUnavailableError("WebRTC is not supported in this environment");
      }

      const snapshot = controller.getSnapshot();
      const role = snapshot.role ?? "host";
      const peer = new RTCPeerConnection({ iceServers: [] });

      const normalize = (value: unknown): Error =>
        value instanceof Error ? value : new Error(String(value));

      const attachChannel = (channel: RTCDataChannel) => {
        channel.binaryType = "arraybuffer";
        channel.addEventListener("message", (event) => emitMessage(event.data));
        channel.addEventListener("error", (event) => {
          const errorEvent = event as ErrorEvent;
          emitError(normalize(errorEvent.error ?? new Error("WebRTC data channel error")));
        });
      };

      if (role === "guest") {
        const waitForRemoteInvite = async (): Promise<string> => {
          const latest = controller.getSnapshot();
          if (latest.remoteInvite) {
            return latest.remoteInvite;
          }

          if (signal.aborted) {
            throw createAbortError();
          }

          return await new Promise<string>((resolve, reject) => {
            let settled = false;
            let unsubscribe: (() => void) | null = null;
            const cleanup = () => {
              if (unsubscribe) {
                unsubscribe();
                unsubscribe = null;
              }
              signal.removeEventListener("abort", handleAbort);
            };

            const handleAbort = () => {
              if (settled) {
                return;
              }
              settled = true;
              cleanup();
              reject(createAbortError());
            };

            unsubscribe = controller.subscribe((next) => {
              if (settled) {
                return;
              }
              if (next.role !== "guest") {
                settled = true;
                cleanup();
                reject(createAbortError());
                return;
              }

              if (next.remoteInvite) {
                settled = true;
                cleanup();
                resolve(next.remoteInvite);
              }
            });

            signal.addEventListener("abort", handleAbort, { once: true });
          });
        };

        const inviteToken = await waitForRemoteInvite();

        const offerPayload = controller.decodeToken(inviteToken);
        if (offerPayload.kind !== "offer") {
          throw new TransportUnavailableError("Remote invite token is not an offer");
        }

        await peer.setRemoteDescription(offerPayload.description);

        const channelPromise = new Promise<RTCDataChannel>((resolve, reject) => {
          const handleAbort = () => {
            peer.ondatachannel = null;
            reject(createAbortError());
          };

          signal.addEventListener("abort", handleAbort, { once: true });

          peer.ondatachannel = (event) => {
            signal.removeEventListener("abort", handleAbort);
            const channel = event.channel;
            attachChannel(channel);
            resolve(channel);
          };
        });

        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        handleAnswerGenerated(answer);

        const channel = await channelPromise;

        await new Promise<void>((resolve, reject) => {
          if (channel.readyState === "open") {
            resolve();
            return;
          }

          const cleanup = () => {
            channel.removeEventListener("open", handleOpen);
            channel.removeEventListener("error", handleError);
            signal.removeEventListener("abort", handleAbort);
          };

          const handleOpen = () => {
            cleanup();
            resolve();
          };

          const handleError = (event: Event) => {
            cleanup();
            reject(
              event instanceof ErrorEvent
                ? event.error ?? new Error("Failed to open WebRTC data channel")
                : new Error("Failed to open WebRTC data channel"),
            );
          };

          const handleAbort = () => {
            cleanup();
            reject(createAbortError());
          };

          channel.addEventListener("open", handleOpen, { once: true });
          channel.addEventListener("error", handleError, { once: true });
          signal.addEventListener("abort", handleAbort, { once: true });
        });

        signal.addEventListener(
          "abort",
          () => {
            try {
              channel.close();
            } finally {
              peer.close();
            }
          },
          { once: true },
        );

        return {
          async send(payload) {
            if (channel.readyState !== "open") {
              throw new Error("WebRTC data channel is not open");
            }
            channel.send(payload as string | ArrayBuffer | ArrayBufferView | Blob);
          },
          async close() {
            channel.close();
            peer.close();
          },
        } satisfies DriverConnection;
      }

      const channel = peer.createDataChannel(
        typeof startOptions.options?.roomId === "string"
          ? startOptions.options.roomId
          : "messaging",
        { ordered: true },
      );
      attachChannel(channel);

      channel.addEventListener("close", () => {
        emitError(new Error("WebRTC data channel closed"));
      });

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);

      let answer: RTCSessionDescriptionInit;
      try {
        answer = await negotiate(offer, startOptions.options);
      } catch (error) {
        if (isNegotiationCancelledError(error)) {
          throw createAbortError();
        }
        throw error;
      }
      await peer.setRemoteDescription(answer);

      await new Promise<void>((resolve, reject) => {
        if (signal.aborted) {
          reject(createAbortError());
          return;
        }

        const cleanup = () => {
          channel.removeEventListener("open", handleOpen);
          channel.removeEventListener("error", handleError);
          signal.removeEventListener("abort", handleAbort);
        };

        const handleOpen = () => {
          cleanup();
          resolve();
        };

        const handleError = (event: Event) => {
          cleanup();
          reject(
            event instanceof ErrorEvent
              ? event.error ?? new Error("Failed to open WebRTC data channel")
              : new Error("Failed to open WebRTC data channel"),
          );
        };

        const handleAbort = () => {
          cleanup();
          reject(createAbortError());
        };

        if (channel.readyState === "open") {
          cleanup();
          resolve();
          return;
        }

        channel.addEventListener("open", handleOpen, { once: true });
        channel.addEventListener("error", handleError, { once: true });
        signal.addEventListener("abort", handleAbort, { once: true });
      });

      signal.addEventListener(
        "abort",
        () => {
          try {
            channel.close();
          } finally {
            peer.close();
          }
        },
        { once: true },
      );

      return {
        async send(payload) {
          if (channel.readyState !== "open") {
            throw new Error("WebRTC data channel is not open");
          }
          channel.send(payload as string | ArrayBuffer | ArrayBufferView | Blob);
        },
        async close() {
          channel.close();
          peer.close();
        },
      } satisfies DriverConnection;
    };

    return {
      udpConnector: undefined,
      createWebRTC: createManualWebRTC,
      signaling: {
        negotiate: (offer, options) => negotiate(offer, options),
        iceServers: [],
      },
      webTransportEndpoint: undefined,
      WebTransportConstructor: undefined,
    } satisfies TransportDependencies;
  };

  const controller: PeerSignalingController = {
    getSnapshot: () => currentState,
    subscribe(listener) {
      listeners.add(listener);
      hydratePersistentState();
      return () => {
        listeners.delete(listener);
      };
    },
    setRole(role) {
      resetNegotiation();
      clearPendingHandshakes();
      commitState({
        role,
        sessionId: createSessionId(),
        ...buildHandshakeResetState(role),
        connected: false,
        error: null,
        lastUpdated: now(),
      });
    },
    async setRemoteInvite(token: string) {
      try {
        const payload = deserializePeerToken(token);
        if (payload.kind !== "offer") {
          throw new Error("Provided token is not an offer");
        }
        commitState({
          remoteInvite: token.trim(),
          awaitingOffer: false,
          localAnswerToken: null,
          localAnswerCreatedAt: null,
          error: null,
          lastUpdated: now(),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid remote invite token";
        commitState({ error: message });
        throw new Error(message);
      }
    },
    async setRemoteAnswer(token: string) {
      try {
        const payload = deserializePeerToken(token);
        if (payload.kind !== "answer") {
          throw new Error("Provided token is not an answer");
        }
        commitState({
          remoteAnswer: token.trim(),
          awaitingAnswer: false,
          localOfferToken: null,
          localOfferCreatedAt: null,
          error: null,
          answerExpiresAt: payload.createdAt + INVITE_TTL_MS,
          lastUpdated: now(),
        });
        if (pendingNegotiation) {
          pendingNegotiation.resolve(payload.description);
          pendingNegotiation = null;
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Invalid remote answer token";
        commitState({ error: message });
        throw new Error(message);
      }
    },
    setActiveTransport(handle) {
      activeTransport = handle;
      evaluateHandshakeQueue();
    },
    clear() {
      resetNegotiation();
      clearPendingHandshakes();
      commitState({
        ...buildHandshakeResetState(),
        connected: false,
        error: null,
        lastUpdated: now(),
      });
    },
    markConnected() {
      commitState({ connected: true, error: null, lastUpdated: now() });
    },
    markDisconnected() {
      commitState({
        ...buildHandshakeResetState(),
        connected: false,
        lastUpdated: now(),
      });
    },
    shouldInitialize() {
      return currentState.role !== null;
    },
    createDependencies,
    decodeToken: (token) => deserializePeerToken(token),
    expireLocalInvite() {
      if (currentState.localInvite) {
        resetNegotiation(new Error("Peer invite expired"));
      }
      commitState({
        localInvite: null,
        localOfferToken: null,
        localOfferCreatedAt: null,
        awaitingAnswer: false,
        inviteExpiresAt: null,
        connected: false,
        error: "Peer invite expired. Generate a new invite to continue.",
        lastUpdated: now(),
      });
    },
    expireLocalAnswer() {
      commitState({
        localAnswer: null,
        localAnswerToken: null,
        localAnswerCreatedAt: null,
        answerExpiresAt: null,
        error: "Peer answer expired. Re-apply the remote invite to continue.",
        lastUpdated: now(),
      });
    },
    hydrateFromStorage() {
      hydratePersistentState();
    },
  } satisfies PeerSignalingController;

  applyExternalHandshakeSignal = (signal) => {
    if (!signal?.handshake) {
      return true;
    }

    if (signal.senderSessionId === currentState.sessionId) {
      return true;
    }

    if (appliedHandshakeTokens.has(signal.handshake.token)) {
      return true;
    }

    const expectedRole: PeerSignalingRole =
      signal.handshake.kind === "offer" ? "guest" : "host";

    if (currentState.role !== expectedRole) {
      return false;
    }

    appliedHandshakeTokens.add(signal.handshake.token);

    const applyPromise =
      signal.handshake.kind === "offer"
        ? controller.setRemoteInvite(signal.handshake.token)
        : controller.setRemoteAnswer(signal.handshake.token);

    applyPromise.catch((error) => {
      console.error("Failed to apply broadcast handshake", error);
    });

    return true;
  };

  if (typeof window !== "undefined") {
    if (typeof BroadcastChannel !== "undefined") {
      try {
        handshakeChannel = handshakeChannel ?? new BroadcastChannel(PEER_HANDSHAKE_CHANNEL);
        handshakeChannel.addEventListener("message", (event) => {
          enqueueExternalHandshake((event as MessageEvent<HandshakeSignal>).data);
        });
      } catch (error) {
        console.warn("Failed to initialize handshake broadcast channel", error);
      }
    }

    window.addEventListener("storage", (event) => {
      if (event.key !== PEER_HANDSHAKE_STORAGE_KEY || !event.newValue) {
        return;
      }

      try {
        const parsed = JSON.parse(event.newValue) as HandshakeSignal;
        enqueueExternalHandshake(parsed);
      } catch {
        // ignore parse failures
      }
    });
  }

  return controller;
};

export const peerSignalingController = createPeerSignalingController();

const getGlobalUDPConnector = (): UDPConnector | undefined => {
  const globalScope = typeof window !== "undefined" ? window : (globalThis as unknown as Record<string, unknown>);

  const fromWindow = (globalScope as { __gogumaUDP?: UDPConnector }).__gogumaUDP;
  if (fromWindow?.join) return fromWindow;

  const navigatorConnector =
    typeof navigator !== "undefined"
      ? (navigator as unknown as { gogumaUDP?: UDPConnector }).gogumaUDP
      : undefined;
  if (navigatorConnector?.join) return navigatorConnector;

  const datagram = (navigator as unknown as { datagram?: UDPConnector })?.datagram;
  if (datagram?.join) return datagram;

  return undefined;
};

const pumpReadableStream = async <T>(
  readable: ReadableStream<T>,
  emit: (value: T) => void,
  signal: AbortSignal,
) => {
  const reader = readable.getReader();
  const abortHandler = () => {
    reader.cancel().catch(() => undefined);
  };

  signal.addEventListener("abort", abortHandler, { once: true });

  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      emit(result.value);
      if (signal.aborted) break;
    }
  } catch (error) {
    if (!signal.aborted) {
      throw error;
    }
  } finally {
    signal.removeEventListener("abort", abortHandler);
    reader.releaseLock();
  }
};

const createUDPDriver = (dependencies: TransportDependencies): TransportDriver => ({
  async start({ signal, options, emitMessage, emitError, emitState }) {
    const connector = dependencies.udpConnector ?? getGlobalUDPConnector();
    if (!connector) {
      throw new TransportUnavailableError("UDP datagram connector is unavailable");
    }

    const session = await connector.join({ ...(options ?? {}), signal });

    let writer: WritableStreamDefaultWriter<TransportMessage> | null = null;
    const cleanupCallbacks: Array<() => void> = [];

    if (session.writable?.getWriter) {
      writer = session.writable.getWriter();
      cleanupCallbacks.push(() => {
        writer?.releaseLock();
        writer = null;
      });
    }

    const handleStateChange = (event: { state: string | TransportState }) => {
      const nextState = event.state as TransportState;
      emitState(nextState);
    };

    const handleError = (error: unknown) => {
      emitError(normalizeError(error));
    };

    if (typeof session.addEventListener === "function") {
      const stateListener = (event: Event) => {
        const detail = (event as CustomEvent<{ state: string }>).detail;
        if (detail?.state) {
          handleStateChange({ state: detail.state });
        }
      };
      session.addEventListener("statechange", stateListener);
      cleanupCallbacks.push(() => session.removeEventListener?.("statechange", stateListener));

      const messageListener = (event: Event) => {
        const detail = event as MessageEvent<TransportMessage>;
        emitMessage(detail.data);
      };
      session.addEventListener("message", messageListener);
      cleanupCallbacks.push(() => session.removeEventListener?.("message", messageListener));

      const errorListener = (event: Event) => {
        const errorEvent = event as ErrorEvent;
        handleError(errorEvent.error ?? errorEvent);
      };
      session.addEventListener("error", errorListener);
      cleanupCallbacks.push(() => session.removeEventListener?.("error", errorListener));
    } else {
      if (session.onstatechange !== undefined) {
        const previous = session.onstatechange;
        session.onstatechange = (event) => {
          previous?.(event);
          handleStateChange({ state: event.state });
        };
        cleanupCallbacks.push(() => {
          session.onstatechange = previous ?? null;
        });
      }

      if (session.onmessage !== undefined) {
        const previous = session.onmessage;
        session.onmessage = (event) => {
          previous?.(event);
          emitMessage(event.data);
        };
        cleanupCallbacks.push(() => {
          session.onmessage = previous ?? null;
        });
      }

      if (session.onerror !== undefined) {
        const previous = session.onerror;
        session.onerror = (error) => {
          if (previous) {
            previous(error);
          }
          handleError(error);
        };
        cleanupCallbacks.push(() => {
          session.onerror = previous ?? null;
        });
      }
    }

    let pumpPromise: Promise<void> | undefined;
    if (session.readable?.getReader) {
      pumpPromise = pumpReadableStream(session.readable, emitMessage, signal).catch((error) => {
        if (!signal.aborted) emitError(normalizeError(error));
      });
      cleanupCallbacks.push(() => {
        pumpPromise?.catch(() => undefined);
      });
    }

    const send = async (payload: TransportMessage) => {
      if (typeof session.send === "function") {
        await session.send(payload);
        return;
      }

      if (writer) {
        await writer.write(payload);
        return;
      }

      throw new Error("Datagram session does not support sending payloads");
    };

    const close = async () => {
      cleanupCallbacks.splice(0).forEach((cleanup) => {
        try {
          cleanup();
        } catch {
          // ignore cleanup failures
        }
      });

      if (writer) {
        await writer.close().catch(() => undefined);
        writer = null;
      }

      if (typeof session.close === "function") {
        await Promise.resolve(session.close()).catch(() => undefined);
      }
    };

    signal.addEventListener(
      "abort",
      () => {
        close().catch(() => undefined);
      },
      { once: true },
    );

    return { send, close };
  },
});

const defaultCreateWebRTC = async (
  startOptions: DriverStartOptions & { dependencies: TransportDependencies },
): Promise<DriverConnection> => {
  const { signal, emitMessage, emitError, emitState, dependencies, options } = startOptions;

  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[transport:webrtc] initializing default WebRTC driver", {
      roomId: options?.roomId,
      hasSignaling: Boolean(dependencies.signaling),
      signalAborted: signal.aborted,
    });
  }

  if (typeof RTCPeerConnection !== "function") {
    throw new TransportUnavailableError("WebRTC is not supported in this environment");
  }

  const peer = new RTCPeerConnection({
    iceServers: dependencies.signaling?.iceServers,
  });

  const channelLabel = typeof options?.roomId === "string" ? options.roomId : "messaging";
  const channel = peer.createDataChannel(channelLabel, { ordered: true });
  channel.binaryType = "arraybuffer";

  channel.onmessage = (event) => {
    emitMessage(event.data);
  };

  channel.onclose = () => {
    emitError(new Error("WebRTC data channel closed"));
  };

  channel.onerror = (event) => {
    const errorEvent = event as ErrorEvent;
    emitError(errorEvent.error ?? new Error("WebRTC data channel error"));
  };

  const { negotiate } = dependencies.signaling ?? {};
  if (!negotiate) {
    peer.close();
    throw new TransportUnavailableError("Missing WebRTC signaling implementation");
  }

  let closed = false;
  let negotiationPromise: Promise<void> | null = null;
  let restartAttempts = 0;
  const prunedCandidates = new Set<string>();
  const knownRelayFingerprints = new Set<string>(
    (dependencies.signaling?.iceServers ?? []).map((server) => JSON.stringify(server)),
  );

  const ensureRelayServers = async (reason: string) => {
    if (!dependencies.relayLocator || closed) {
      return;
    }

    try {
      const extraServers = await dependencies.relayLocator({
        attempt: restartAttempts + 1,
        reason,
      });
      if (!extraServers || !extraServers.length) {
        return;
      }

      const configuration = peer.getConfiguration();
      const nextServers = [...(configuration.iceServers ?? [])];
      let applied = false;
      for (const server of extraServers) {
        if (!server) continue;
        const fingerprint = JSON.stringify(server);
        if (knownRelayFingerprints.has(fingerprint)) {
          continue;
        }
        knownRelayFingerprints.add(fingerprint);
        nextServers.push(server);
        applied = true;
      }

      if (applied) {
        try {
          peer.setConfiguration({ ...configuration, iceServers: nextServers });
        } catch (error) {
          console.warn("Failed to apply relay ICE servers", error);
        }
      }
    } catch (error) {
      console.warn("Failed to resolve relay servers", error);
    }
  };

  const pruneFailedCandidates = async () => {
    if (typeof peer.getStats !== "function") {
      return;
    }

    try {
      const stats = await peer.getStats();
      const removals: RTCIceCandidateInit[] = [];
      stats.forEach((report) => {
        const candidatePair = report as RTCStats & {
          type?: string;
          state?: string;
          remoteCandidateId?: string;
        };
        if (candidatePair.type !== "candidate-pair") return;
        if (candidatePair.state !== "failed") return;
        if (!candidatePair.remoteCandidateId) return;

        const remote = stats.get(candidatePair.remoteCandidateId) as
          | (RTCStats & {
              type?: string;
              candidate?: string;
              sdpMid?: string;
              sdpMLineIndex?: number;
            })
          | undefined;

        if (!remote || remote.type !== "remote-candidate") {
          return;
        }

        const candidateValue = remote.candidate;
        if (!candidateValue || prunedCandidates.has(candidateValue)) {
          return;
        }

        prunedCandidates.add(candidateValue);
        removals.push({
          candidate: candidateValue,
          sdpMid: remote.sdpMid,
          sdpMLineIndex: remote.sdpMLineIndex,
        });
      });

      if (!removals.length) {
        return;
      }

      await Promise.all(
        removals.map((candidate) =>
          peer.removeIceCandidate(candidate).catch(() => undefined),
        ),
      );
    } catch (error) {
      console.warn("Failed to prune ICE candidates", error);
    }
  };

  const scheduleNegotiation = (params: {
    iceRestart: boolean;
    reason: string;
    initial?: boolean;
  }): Promise<void> => {
    if (closed || signal.aborted) {
      return Promise.resolve();
    }

    if (negotiationPromise) {
      return negotiationPromise;
    }

    negotiationPromise = (async () => {
      if (params.iceRestart) {
        restartAttempts += 1;
      }

      if (!params.initial) {
        emitState("recovering");
      }

      await pruneFailedCandidates();

      if (params.iceRestart) {
        await ensureRelayServers(params.reason);
        if (typeof peer.restartIce === "function") {
          try {
            peer.restartIce();
          } catch {
            // Some browsers throw when restartIce is unsupported; ignore.
          }
        }
      }

      const offer = await peer.createOffer(
        params.iceRestart ? { iceRestart: true } : undefined,
      );
      await peer.setLocalDescription(offer);

      const localDescription = peer.localDescription;
      if (!localDescription) {
        throw new Error("Missing WebRTC local description");
      }

      let answer: RTCSessionDescriptionInit;
      try {
        answer = await negotiate(localDescription, options);
      } catch (error) {
        if (isNegotiationCancelledError(error)) {
          throw createAbortError();
        }
        throw error;
      }
      await peer.setRemoteDescription(answer);

      if (!params.initial) {
        emitState("connected");
      }

      restartAttempts = 0;
    })()
      .catch((error) => {
        if (isNegotiationCancelledError(error)) {
          throw createAbortError();
        }
        if (!signal.aborted && !closed) {
          emitError(normalizeError(error));
          emitState("error");
        }
        throw error;
      })
      .finally(() => {
        negotiationPromise = null;
      });

    return negotiationPromise;
  };

  await scheduleNegotiation({ iceRestart: false, reason: "initial", initial: true });

  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const cleanup = () => {
      if (channel.removeEventListener) {
        channel.removeEventListener("open", handleOpen);
        channel.removeEventListener("error", handleError);
      } else {
        channel.onopen = null;
        channel.onerror = null;
      }
      signal.removeEventListener("abort", handleAbort);
    };

    const handleOpen = () => {
      cleanup();
      resolve();
    };

    const handleError = (event: Event) => {
      cleanup();
      reject(
        event instanceof ErrorEvent
          ? event.error ?? new Error("Failed to open WebRTC data channel")
          : new Error("Failed to open WebRTC data channel"),
      );
    };

    const handleAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    signal.addEventListener("abort", handleAbort, { once: true });

    if (channel.readyState === "open") {
      cleanup();
      resolve();
      return;
    }

    if (channel.addEventListener) {
      channel.addEventListener("open", handleOpen, { once: true });
      channel.addEventListener("error", handleError, { once: true });
    } else {
      channel.onopen = handleOpen;
      channel.onerror = handleError as (this: RTCDataChannel, ev: Event) => void;
    }
  });

  const handleIceStateChange = () => {
    switch (peer.iceConnectionState) {
      case "connected":
      case "completed": {
        emitState("connected");
        restartAttempts = 0;
        break;
      }
      case "disconnected": {
        emitState("degraded");
        void scheduleNegotiation({
          iceRestart: true,
          reason: "ice-disconnected",
        }).catch(() => undefined);
        break;
      }
      case "failed": {
        emitState("recovering");
        void scheduleNegotiation({
          iceRestart: true,
          reason: "ice-failed",
        }).catch(() => undefined);
        break;
      }
      case "closed": {
        emitState("closed");
        break;
      }
      default:
        break;
    }
  };

  const handleConnectionStateChange = () => {
    switch (peer.connectionState) {
      case "connected": {
        emitState("connected");
        restartAttempts = 0;
        break;
      }
      case "disconnected": {
        emitState("degraded");
        break;
      }
      case "failed": {
        emitState("recovering");
        void scheduleNegotiation({
          iceRestart: true,
          reason: "connection-failed",
        }).catch(() => undefined);
        break;
      }
      default:
        break;
    }
  };

  const handleNegotiationNeeded = () => {
    void scheduleNegotiation({
      iceRestart: false,
      reason: "renegotiation-needed",
    }).catch(() => undefined);
  };

  const handleIceCandidateError = () => {
    emitState("degraded");
    void scheduleNegotiation({
      iceRestart: true,
      reason: "ice-candidate-error",
    }).catch(() => undefined);
  };

  peer.addEventListener("iceconnectionstatechange", handleIceStateChange);
  peer.addEventListener("connectionstatechange", handleConnectionStateChange);
  peer.addEventListener("negotiationneeded", handleNegotiationNeeded);
  peer.addEventListener("icecandidateerror", handleIceCandidateError);

  signal.addEventListener(
    "abort",
    () => {
      closed = true;
      peer.removeEventListener("iceconnectionstatechange", handleIceStateChange);
      peer.removeEventListener("connectionstatechange", handleConnectionStateChange);
      peer.removeEventListener("negotiationneeded", handleNegotiationNeeded);
      peer.removeEventListener("icecandidateerror", handleIceCandidateError);
      try {
        channel.close();
      } finally {
        peer.close();
      }
    },
    { once: true },
  );

  return {
    async send(payload) {
      if (channel.readyState !== "open") {
        throw new Error("WebRTC data channel is not open");
      }

      channel.send(payload as string | ArrayBuffer | ArrayBufferView | Blob);
    },
    async close() {
      closed = true;
      peer.removeEventListener("iceconnectionstatechange", handleIceStateChange);
      peer.removeEventListener("connectionstatechange", handleConnectionStateChange);
      peer.removeEventListener("negotiationneeded", handleNegotiationNeeded);
      peer.removeEventListener("icecandidateerror", handleIceCandidateError);
      channel.close();
      peer.close();
    },
  };
};

const defaultCreateWebTransport = async (
  startOptions: DriverStartOptions & { dependencies: TransportDependencies; endpoint?: string },
): Promise<DriverConnection> => {
  const { dependencies, options, signal } = startOptions;
  const endpointCandidate =
    startOptions.endpoint ??
    (typeof dependencies.webTransportEndpoint === "function"
      ? dependencies.webTransportEndpoint(options)
      : dependencies.webTransportEndpoint) ??
    (typeof options?.url === "string" ? options.url : undefined);

  if (!endpointCandidate) {
    throw new TransportUnavailableError("WebTransport endpoint is not configured");
  }

  const WebTransportCtor =
    dependencies.WebTransportConstructor ??
    ((typeof WebTransport !== "undefined" ? WebTransport : undefined) as
      | (new (url: string) => WebTransportLike)
      | undefined);

  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug("[transport:webtransport] starting connection", {
      endpoint: endpointCandidate,
      hasConstructor: Boolean(WebTransportCtor),
    });
  }

  if (!WebTransportCtor) {
    throw new TransportUnavailableError("WebTransport is not supported in this environment");
  }

  const transport = new WebTransportCtor(endpointCandidate);

  const textEncoderFactory = dependencies.textEncoder ?? (() => new TextEncoder());

  signal.addEventListener(
    "abort",
    () => {
      transport.close({ closeCode: 0, reason: "aborted" }).catch(() => undefined);
    },
    { once: true },
  );

  await transport.ready;

  const datagrams = transport.datagrams;
  if (!datagrams?.readable || !datagrams?.writable) {
    throw new TransportUnavailableError("WebTransport datagrams are unavailable");
  }

  const reader = datagrams.readable.getReader();
  const writer = datagrams.writable.getWriter();

  const pump = async () => {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        startOptions.emitMessage(value);
      }
    } catch (error) {
      if (!signal.aborted) {
        startOptions.emitError(normalizeError(error));
      }
    }
  };

  pump();

  transport.closed.catch((error) => {
    if (!signal.aborted) {
      startOptions.emitError(normalizeError(error));
    }
  });

  return {
    async send(payload) {
      if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
        await writer.write(new Uint8Array(payload as ArrayBufferLike));
        return;
      }

      if (payload instanceof Blob) {
        const buffer = await payload.arrayBuffer();
        await writer.write(new Uint8Array(buffer));
        return;
      }

      if (typeof payload === "string") {
        const encoder = textEncoderFactory();
        await writer.write(encoder.encode(payload));
        return;
      }

      throw new Error("Unsupported payload type for WebTransport datagrams");
    },
    async close() {
      await writer.close().catch(() => undefined);
      await reader.cancel().catch(() => undefined);
      await transport.close({ closeCode: 0 }).catch(() => undefined);
    },
  };
};

const createProgressiveDriver = (
  dependencies: TransportDependencies,
): TransportDriver => ({
  async start(startOptions) {
    const withDependencies = { ...startOptions, dependencies };

    if (typeof console !== "undefined" && typeof console.debug === "function") {
      console.debug("[transport:progressive] starting progressive driver", {
        options: startOptions.options,
        mode: "progressive",
      });
    }

    const webrtcFactory =
      dependencies.createWebRTC ?? ((options) => defaultCreateWebRTC(options));
    try {
      return await webrtcFactory(withDependencies);
    } catch (error) {
      const normalized = normalizeError(error);
      startOptions.emitError(normalized);

      const endpoint =
        typeof dependencies.webTransportEndpoint === "function"
          ? dependencies.webTransportEndpoint(startOptions.options)
          : dependencies.webTransportEndpoint;

      if (dependencies.createWebTransport || endpoint) {
        if (typeof console !== "undefined" && typeof console.debug === "function") {
          console.debug("[transport:progressive] WebRTC failed, falling back to WebTransport", {
            error: normalized.message,
            endpoint,
          });
        }
        const webTransportFactory =
          dependencies.createWebTransport ?? ((options) => defaultCreateWebTransport(options));

        return webTransportFactory({
          ...withDependencies,
          endpoint,
        });
      }

      throw normalized;
    }
  },
});

type TransportFactory = () => TransportHandle;

const udpTransport = (dependencies: TransportDependencies): TransportFactory => () =>
  createTransportHandle("udp", createUDPDriver(dependencies));

const progressiveTransport = (
  dependencies: TransportDependencies,
): TransportFactory => () =>
  createTransportHandle("progressive", createProgressiveDriver(dependencies));

const getFactoryForMode = (
  mode: MessagingMode,
  dependencies: TransportDependencies,
  overrides: Partial<Record<MessagingMode, TransportFactory>>,
): TransportFactory => {
  if (overrides[mode]) {
    return overrides[mode]!;
  }

  return mode === "udp"
    ? udpTransport(dependencies)
    : progressiveTransport(dependencies);
};

export function initializeMessagingTransport(options: {
  onModeChange?: (mode: MessagingMode) => void;
  connectOptions?: TransportConnectOptions;
  dependencies?: TransportDependencies;
  factories?: Partial<Record<MessagingMode, TransportFactory>>;
} = {}) {
  const dependencies = options.dependencies ?? {};
  const overrides = options.factories ?? {};

  let currentMode = loadMessagingMode();
  let currentHandle: TransportHandle | null = null;
  let switchPromise: Promise<void> | null = null;
  let readyPromise: Promise<void> = Promise.resolve();
  let lastError: Error | null = null;

  const executeSwitch = async (mode: MessagingMode): Promise<boolean> => {
    if (mode === currentMode && currentHandle) {
      return true;
    }

    const previousHandle = currentHandle;
    const factory = getFactoryForMode(mode, dependencies, overrides);
    const nextHandle = factory();
    currentHandle = nextHandle;

    try {
      await nextHandle.connect(options.connectOptions);
      currentMode = mode;
      options.onModeChange?.(mode);

      if (previousHandle) {
        await previousHandle.disconnect();
      }
      lastError = null;
      return true;
    } catch (error) {
      const normalized = normalizeError(error);
      lastError = normalized;
      await nextHandle.disconnect().catch(() => undefined);
      currentHandle = previousHandle;
      return false;
    }
  };

  const queueSwitch = (mode: MessagingMode) => {
    const previous = switchPromise ?? Promise.resolve();
    const pending = previous.then(() => executeSwitch(mode));

    const tracking = pending
      .catch(() => false)
      .then(() => undefined)
      .finally(() => {
        if (switchPromise === tracking) {
          switchPromise = null;
        }
      });

    switchPromise = tracking;
    readyPromise = pending.then((success) => {
      if (!success) {
        throw lastError ?? new Error("Failed to switch messaging transport");
      }
    });
    readyPromise.catch(() => undefined);

    return pending;
  };

  queueSwitch(currentMode);
  const initialReady = readyPromise;

  const listener = (event: Event) => {
    const nextMode = (event as CustomEvent<MessagingMode>).detail;
    if (!nextMode) return;
    queueSwitch(nextMode).catch(() => undefined);
  };

  if (typeof window !== "undefined") {
    window.addEventListener(MESSAGING_MODE_EVENT, listener);
  }

  const teardown = async () => {
    if (typeof window !== "undefined") {
      window.removeEventListener(MESSAGING_MODE_EVENT, listener);
    }

    try {
      await readyPromise.catch(() => undefined);
      if (switchPromise) {
        await switchPromise.catch(() => undefined);
      }
    } finally {
      if (currentHandle) {
        await currentHandle.disconnect();
      }
      currentHandle = null;
    }
  };

  return {
    get mode() {
      return currentMode;
    },
    get transport() {
      return currentHandle;
    },
    whenReady: () => initialReady,
    refresh: () => queueSwitch(loadMessagingMode()),
    switchMode: queueSwitch,
    teardown,
  };
}
