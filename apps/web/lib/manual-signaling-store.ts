import {
  TransportUnavailableError,
  type TransportConnectOptions,
  type TransportDependencies,
} from "@/lib/messaging-transport";

export type ManualSignalingRole = "offerer" | "answerer";

export type ManualSignalingState = {
  role: ManualSignalingRole | null;
  sessionId: string;
  localOfferToken: string | null;
  localAnswerToken: string | null;
  remoteOfferToken: string | null;
  remoteAnswerToken: string | null;
  awaitingAnswer: boolean;
  awaitingOffer: boolean;
  connected: boolean;
  error: string | null;
  lastUpdated: number | null;
};

type ManualSignalingTokenKind = "offer" | "answer";

type ManualSignalingTokenPayload = {
  type: "goguma-signaling";
  kind: ManualSignalingTokenKind;
  description: RTCSessionDescriptionInit;
  roomId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
};

type Listener = (state: ManualSignalingState) => void;

type NegotiationEntry = {
  resolve: (description: RTCSessionDescriptionInit) => void;
  reject: (error: Error) => void;
};

type PersistentState = {
  role: ManualSignalingRole | null;
  sessionId: string;
  localOfferToken: string | null;
  localAnswerToken: string | null;
  remoteOfferToken: string | null;
  remoteAnswerToken: string | null;
  connected: boolean;
  lastUpdated: number | null;
};

const STORAGE_KEY = "manual-signaling-state";

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

const createAbortError = () =>
  typeof DOMException !== "undefined"
    ? new DOMException("Negotiation aborted", "AbortError")
    : new Error("Negotiation aborted");

const createSessionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;

const serializeToken = (payload: ManualSignalingTokenPayload) =>
  encodeBase64(JSON.stringify(payload));

const deserializeToken = (token: string): ManualSignalingTokenPayload => {
  try {
    const raw = decodeBase64(token.trim());
    const parsed = JSON.parse(raw) as ManualSignalingTokenPayload;
    if (parsed?.type !== "goguma-signaling") {
      throw new Error("Invalid signaling token");
    }
    if (parsed.kind !== "offer" && parsed.kind !== "answer") {
      throw new Error("Unsupported signaling token kind");
    }
    if (!parsed.description || typeof parsed.description.sdp !== "string") {
      throw new Error("Signaling token is missing SDP");
    }
    return parsed;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to parse signaling token";
    throw new Error(message);
  }
};

const loadPersistentState = (): PersistentState | null => {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored) as PersistentState;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      role: parsed.role ?? null,
      sessionId: parsed.sessionId ?? createSessionId(),
      localOfferToken: parsed.localOfferToken ?? null,
      localAnswerToken: parsed.localAnswerToken ?? null,
      remoteOfferToken: parsed.remoteOfferToken ?? null,
      remoteAnswerToken: parsed.remoteAnswerToken ?? null,
      connected: Boolean(parsed.connected),
      lastUpdated: parsed.lastUpdated ?? null,
    };
  } catch {
    return null;
  }
};

const persistState = (state: PersistentState) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore storage failures
  }
};

const initialPersistent = loadPersistentState();

const initialState: ManualSignalingState = {
  role: initialPersistent?.role ?? null,
  sessionId: initialPersistent?.sessionId ?? createSessionId(),
  localOfferToken: initialPersistent?.localOfferToken ?? null,
  localAnswerToken: initialPersistent?.localAnswerToken ?? null,
  remoteOfferToken: initialPersistent?.remoteOfferToken ?? null,
  remoteAnswerToken: initialPersistent?.remoteAnswerToken ?? null,
  awaitingAnswer: false,
  awaitingOffer: false,
  connected: initialPersistent?.connected ?? false,
  error: null,
  lastUpdated: initialPersistent?.lastUpdated ?? null,
};

const listeners = new Set<Listener>();

let currentState: ManualSignalingState = initialState;
let pendingNegotiation: NegotiationEntry | null = null;

const notify = () => {
  listeners.forEach((listener) => {
    try {
      listener(currentState);
    } catch (error) {
      console.error("Manual signaling listener failed", error);
    }
  });
};

const commitState = (update: Partial<ManualSignalingState>) => {
  currentState = { ...currentState, ...update };
  const persistent: PersistentState = {
    role: currentState.role,
    sessionId: currentState.sessionId,
    localOfferToken: currentState.localOfferToken,
    localAnswerToken: currentState.localAnswerToken,
    remoteOfferToken: currentState.remoteOfferToken,
    remoteAnswerToken: currentState.remoteAnswerToken,
    connected: currentState.connected,
    lastUpdated: currentState.lastUpdated,
  };
  persistState(persistent);
  notify();
};

const resetNegotiation = (error?: Error) => {
  if (pendingNegotiation) {
    if (error) {
      pendingNegotiation.reject(error);
    } else {
      pendingNegotiation.reject(
        new Error("Signaling negotiation cancelled before completion"),
      );
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
  ensureSession();
  const token = serializeToken({
    type: "goguma-signaling",
    kind: "offer",
    description,
    roomId: typeof connectOptions?.roomId === "string" ? connectOptions.roomId : undefined,
    metadata: connectOptions?.metadata,
    createdAt: now(),
  });

  commitState({
    localOfferToken: token,
    awaitingAnswer: true,
    lastUpdated: now(),
    connected: false,
    error: null,
  });
};

const handleAnswerGenerated = (description: RTCSessionDescriptionInit) => {
  ensureSession();
  const token = serializeToken({
    type: "goguma-signaling",
    kind: "answer",
    description,
    roomId: null,
    metadata: undefined,
    createdAt: now(),
  });

  commitState({
    localAnswerToken: token,
    awaitingOffer: false,
    lastUpdated: now(),
    error: null,
  });
};

const manualSignaling = {
  getState(): ManualSignalingState {
    return currentState;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setRole(role: ManualSignalingRole | null) {
    resetNegotiation();
    commitState({
      role,
      sessionId: createSessionId(),
      localOfferToken: null,
      localAnswerToken: null,
      remoteOfferToken: null,
      remoteAnswerToken: null,
      awaitingAnswer: false,
      awaitingOffer: role === "answerer",
      connected: false,
      error: null,
      lastUpdated: now(),
    });
  },
  async setRemoteOfferToken(token: string) {
    try {
      const payload = deserializeToken(token);
      if (payload.kind !== "offer") {
        throw new Error("Provided token is not an offer");
      }
      commitState({
        remoteOfferToken: token.trim(),
        awaitingOffer: false,
        error: null,
        lastUpdated: now(),
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Invalid remote offer token";
      commitState({ error: message });
      throw new Error(message);
    }
  },
  async setRemoteAnswerToken(token: string) {
    try {
      const payload = deserializeToken(token);
      if (payload.kind !== "answer") {
        throw new Error("Provided token is not an answer");
      }
      commitState({
        remoteAnswerToken: token.trim(),
        awaitingAnswer: false,
        error: null,
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
  clearTokens() {
    resetNegotiation();
    commitState({
      localOfferToken: null,
      localAnswerToken: null,
      remoteOfferToken: null,
      remoteAnswerToken: null,
      awaitingAnswer: false,
      awaitingOffer: currentState.role === "answerer",
      connected: false,
      error: null,
      lastUpdated: now(),
    });
  },
  markConnected() {
    commitState({ connected: true, error: null, lastUpdated: now() });
  },
  markDisconnected() {
    commitState({ connected: false, lastUpdated: now() });
  },
  async negotiate(
    offer: RTCSessionDescriptionInit,
    connectOptions?: TransportConnectOptions,
  ) {
    handleOfferCreated(offer, connectOptions);

    if (currentState.remoteAnswerToken) {
      try {
        const payload = deserializeToken(currentState.remoteAnswerToken);
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

    return await new Promise<RTCSessionDescriptionInit>((resolve, reject) => {
      pendingNegotiation = { resolve, reject };
    });
  },
  decodeToken(token: string) {
    return deserializeToken(token);
  },
  shouldInitialize() {
    if (currentState.role === "offerer") {
      return true;
    }
    if (currentState.role === "answerer") {
      return Boolean(currentState.remoteOfferToken);
    }
    return false;
  },
  createDependencies(): TransportDependencies {
    const controller = this;
    const createManualWebRTC: NonNullable<TransportDependencies["createWebRTC"]> = async (
      startOptions,
    ) => {
      const { signal, emitMessage, emitError } = startOptions;

      if (typeof RTCPeerConnection !== "function") {
        throw new TransportUnavailableError("WebRTC is not supported in this environment");
      }

      const role = controller.getState().role ?? "offerer";
      const peer = new RTCPeerConnection({ iceServers: [] });

      const normalizeError = (value: unknown): Error =>
        value instanceof Error ? value : new Error(String(value));

      const attachChannel = (channel: RTCDataChannel) => {
        channel.binaryType = "arraybuffer";
        channel.addEventListener("message", (event) => emitMessage(event.data));
        channel.addEventListener("error", (event) => {
          const errorEvent = event as ErrorEvent;
          emitError(
            normalizeError(errorEvent.error ?? new Error("WebRTC data channel error")),
          );
        });
      };

      if (role === "answerer") {
        const state = controller.getState();
        if (!state.remoteOfferToken) {
          throw new TransportUnavailableError("Missing remote offer token for manual signaling");
        }

        const offerPayload = controller.decodeToken(state.remoteOfferToken);
        if (offerPayload.kind !== "offer") {
          throw new TransportUnavailableError("Remote token is not an offer");
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
        };
      }

      // Offerer flow
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

      const answer = await controller.negotiate(offer, startOptions.options);
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
      };
    };

    return {
      udpConnector: undefined,
      createWebRTC: createManualWebRTC,
      createWebTransport: async () => {
        throw new TransportUnavailableError(
          "WebTransport is disabled for manual peer connections",
        );
      },
      signaling: {
        negotiate: (offer, options) => this.negotiate(offer, options),
        iceServers: [],
      },
      webTransportEndpoint: undefined,
      WebTransportConstructor: undefined,
    } satisfies TransportDependencies;
  },
};

export type ManualSignalingController = typeof manualSignaling;

export { manualSignaling };
