import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

import {
  initializeMessagingTransport,
  TransportDependencies,
  TransportHandle,
  TransportMessage,
  TransportState,
  TransportUnavailableError,
  createPeerSignalingController,
  type PeerHandshakeFrame,
} from "../messaging-transport";
import { createPeerCryptoSession } from "../crypto/session";
import { type MessagingMode } from "../messaging-mode";

type ListenerMap = Map<string, Set<(event: Event) => void>>;

declare global {
  var __testWindowListeners: ListenerMap | undefined;
}

type BroadcastListener = (event: { data: unknown }) => void;

class MockBroadcastChannel {
  static instances = new Map<string, Set<MockBroadcastChannel>>();

  readonly name: string;
  private listeners = new Set<BroadcastListener>();

  constructor(name: string) {
    this.name = name;
    if (!MockBroadcastChannel.instances.has(name)) {
      MockBroadcastChannel.instances.set(name, new Set());
    }
    MockBroadcastChannel.instances.get(name)!.add(this);
  }

  postMessage(data: unknown) {
    const peers = MockBroadcastChannel.instances.get(this.name);
    if (!peers) return;
    peers.forEach((peer) => {
      peer.listeners.forEach((listener) => {
        listener({ data });
      });
    });
  }

  addEventListener(type: string, listener: BroadcastListener) {
    if (type !== "message") return;
    this.listeners.add(listener);
  }

  removeEventListener(type: string, listener: BroadcastListener) {
    if (type !== "message") return;
    this.listeners.delete(listener);
  }

  close() {
    const peers = MockBroadcastChannel.instances.get(this.name);
    peers?.delete(this);
    this.listeners.clear();
  }

  static reset() {
    MockBroadcastChannel.instances.clear();
  }
}

const installWindow = () => {
  const listeners: ListenerMap = new Map();
  globalThis.__testWindowListeners = listeners;

  const addEventListener = (type: string, listener: (event: Event) => void) => {
    if (!listeners.has(type)) listeners.set(type, new Set());
    listeners.get(type)!.add(listener);
  };

  const removeEventListener = (type: string, listener: (event: Event) => void) => {
    listeners.get(type)?.delete(listener);
  };

  const dispatchEvent = (event: Event) => {
    const handlers = listeners.get(event.type);
    if (!handlers) return true;
    handlers.forEach((handler) => handler(event));
    return !event.defaultPrevented;
  };

  Object.assign(globalThis, {
    window: {
      addEventListener,
      removeEventListener,
      dispatchEvent,
      localStorage: {
        storage: new Map<string, string>(),
        getItem(key: string) {
          return this.storage.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          this.storage.set(key, value);
        },
      },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      btoa: (value: string) => Buffer.from(value, "utf-8").toString("base64"),
      atob: (value: string) => Buffer.from(value, "base64").toString("utf-8"),
      BroadcastChannel: MockBroadcastChannel as unknown as typeof BroadcastChannel,
    },
    BroadcastChannel: MockBroadcastChannel as unknown as typeof BroadcastChannel,
  });
};

const uninstallWindow = () => {
  delete (globalThis as Record<string, unknown>).window;
  delete globalThis.__testWindowListeners;
  delete (globalThis as Record<string, unknown>).BroadcastChannel;
};

describe("initializeMessagingTransport", () => {
  beforeEach(() => {
    MockBroadcastChannel.reset();
    installWindow();
  });

  afterEach(() => {
    uninstallWindow();
  });

  const createMockDriver = (
    label: string,
  ): TransportDependencies["createWebRTC"] =>
    async ({ emitMessage, signal, options }) => {
      const sessionId =
        typeof options?.metadata?.peerSessionId === "string"
          ? options.metadata.peerSessionId
          : "default-peer-session";

      const remoteSession = await createPeerCryptoSession({
        sessionId,
        onPlaintext: (payload) => emitMessage(payload),
      });

      remoteSession.attachTransmitter(async (payload) => {
        emitMessage(payload);
      });

      let timer: ReturnType<typeof setTimeout> | null = null;

      const abortHandler = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void remoteSession.teardown();
      };

      signal.addEventListener("abort", abortHandler, { once: true });

      void remoteSession
        .whenReady()
        .then(() => {
          timer = setTimeout(() => {
            void remoteSession.send(`${label}-hello`).catch(() => undefined);
          }, 0);
        })
        .catch(() => undefined);

      return {
        async send(payload) {
          await remoteSession.receive(payload);
        },
        async close() {
          signal.removeEventListener("abort", abortHandler);
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          await remoteSession.teardown();
        },
      };
    };

  const createMockWebSocketDriver = (
    label: string,
    context: {
      received?: TransportMessage[];
      endpoints?: Array<string | undefined>;
      onReady?: (session: Awaited<ReturnType<typeof createPeerCryptoSession>>) => void;
    } = {},
  ): TransportDependencies["createWebSocket"] =>
    async ({ emitMessage, signal, options, endpoint }) => {
      context.endpoints?.push(endpoint);

      const sessionId =
        typeof options?.metadata?.peerSessionId === "string"
          ? options.metadata.peerSessionId
          : "default-peer-session";

      const remoteSession = await createPeerCryptoSession({
        sessionId,
        onPlaintext: (payload) => {
          context.received?.push(payload);
          emitMessage(payload);
        },
      });

      remoteSession.attachTransmitter(async (payload) => {
        emitMessage(payload);
      });

      let timer: ReturnType<typeof setTimeout> | null = null;

      const abortHandler = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        void remoteSession.teardown();
      };

      signal.addEventListener("abort", abortHandler, { once: true });

      void remoteSession
        .whenReady()
        .then(() => {
          if (context.onReady) {
            context.onReady(remoteSession);
            return;
          }

          timer = setTimeout(() => {
            void remoteSession.send(`${label}-hello`).catch(() => undefined);
          }, 10);
        })
        .catch(() => undefined);

      return {
        async send(payload) {
          await remoteSession.receive(payload);
        },
        async close() {
          signal.removeEventListener("abort", abortHandler);
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          await remoteSession.teardown();
        },
      };
    };

  it("connects using the progressive pipeline and notifies listeners once ready", async () => {
    const dependencies: TransportDependencies = {
      createWebRTC: createMockDriver("progressive"),
    };

    const onModeChange = mock((mode: MessagingMode) => mode);
    const controller = initializeMessagingTransport({ dependencies, onModeChange });

    await controller.whenReady();
    const handle = controller.transport as TransportHandle;
    expect(handle.mode).toBe("progressive");
    expect(handle.state).toBe("connected");
    expect(onModeChange).toHaveBeenCalledWith("progressive");

    const inbound: TransportMessage[] = [];

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 500);
      const unsubscribe = handle.onMessage((message) => {
        inbound.push(message);
        if (message === "progressive-hello") {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

    expect(inbound).toContain("progressive-hello");
    expect(handle.state).toBe("connected");
  });

  it("falls back to WebTransport when WebRTC connection fails", async () => {
    const webrtcError = new Error("webrtc failed");
    const dependencies: TransportDependencies = {
      createWebRTC: async () => {
        throw webrtcError;
      },
      createWebTransport: async ({ emitMessage, signal, options }) => {
        const sessionId =
          typeof options?.metadata?.peerSessionId === "string"
            ? options.metadata.peerSessionId
            : "default-peer-session";

        const remoteSession = await createPeerCryptoSession({
          sessionId,
          onPlaintext: (payload) => emitMessage(payload),
        });

        remoteSession.attachTransmitter(async (payload) => {
          emitMessage(payload);
        });

        let timer: ReturnType<typeof setTimeout> | null = null;

        const abortHandler = () => {
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          void remoteSession.teardown();
        };

        signal.addEventListener("abort", abortHandler, { once: true });

        void remoteSession
          .whenReady()
          .then(() => {
            timer = setTimeout(() => {
              void remoteSession.send("fallback").catch(() => undefined);
            }, 0);
          })
          .catch(() => undefined);

        return {
          async send(payload) {
            await remoteSession.receive(payload);
          },
          async close() {
            signal.removeEventListener("abort", abortHandler);
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            await remoteSession.teardown();
          },
        };
      },
    };

    const controller = initializeMessagingTransport({ dependencies });
    await controller.whenReady();
    const handle = controller.transport as TransportHandle;
    const received: TransportMessage[] = [];

    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, 500);
      const unsubscribe = handle.onMessage((message) => {
        received.push(message);
        if (message === "fallback") {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

    expect(received).toContain("fallback");
    expect(handle.state).toBe("connected");
  });

  it("connects using the websocket mode and relays messages", async () => {
    const remoteReceived: TransportMessage[] = [];
    const endpoints: Array<string | undefined> = [];
    let remoteSession: Awaited<ReturnType<typeof createPeerCryptoSession>> | null = null;
    let resolveRemoteReady: (() => void) | null = null;
    const remoteReady = new Promise<void>((resolve) => {
      resolveRemoteReady = resolve;
    });

    const dependencies: TransportDependencies = {
      webSocketEndpoint: "ws://example.com/ws",
      createWebSocket: createMockWebSocketDriver("websocket", {
        received: remoteReceived,
        endpoints,
        onReady: (session) => {
          remoteSession = session;
          resolveRemoteReady?.();
        },
      }),
    };

    (window as { localStorage: Storage }).localStorage.setItem(
      "site-messaging-mode",
      "websocket",
    );

    const controller = initializeMessagingTransport({ dependencies });

    await controller.whenReady();
    const handle = controller.transport as TransportHandle;

    expect(handle.mode).toBe("websocket");
    expect(handle.state).toBe("connected");
    expect(endpoints).toContain("ws://example.com/ws");

    const inbound: TransportMessage[] = [];

    const inboundPromise = new Promise<void>((resolve) => {
      const unsubscribe = handle.onMessage((message) => {
        inbound.push(message);
        if (message === "websocket-hello") {
          unsubscribe();
          resolve();
        }
      });
    });

    await remoteReady;
    await remoteSession?.send("websocket-hello");
    await inboundPromise;

    await handle.send("client-ping");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(inbound).toContain("websocket-hello");
    expect(remoteReceived).toContain("client-ping");

    const states: TransportState[] = [];
      const unsubscribeState = handle.onStateChange((state) => states.push(state));
      await handle.disconnect();
      unsubscribeState();

      expect(states).toContain("closed");
      await controller.teardown();
    });

  it("falls back to WebSocket when progressive drivers are unavailable", async () => {
    const endpoints: Array<string | undefined> = [];
    let remoteSession: Awaited<ReturnType<typeof createPeerCryptoSession>> | null = null;
    let resolveRemoteReady: (() => void) | null = null;
    const remoteReady = new Promise<void>((resolve) => {
      resolveRemoteReady = resolve;
    });

    const dependencies: TransportDependencies = {
      createWebRTC: async () => {
        throw new TransportUnavailableError("webrtc unavailable");
      },
      createWebTransport: async () => {
        throw new TransportUnavailableError("webtransport unavailable");
      },
      webTransportEndpoint: "https://irrelevant.example", // ensures progressive attempts fallback path
      webSocketEndpoint: "ws://fallback.test/ws",
      createWebSocket: createMockWebSocketDriver("ws-fallback", {
        endpoints,
        onReady: (session) => {
          remoteSession = session;
          resolveRemoteReady?.();
        },
      }),
    };

    const controller = initializeMessagingTransport({ dependencies });
    await controller.whenReady();
    const handle = controller.transport as TransportHandle;

    expect(handle.mode).toBe("progressive");
    expect(handle.state).toBe("connected");

    const inbound: TransportMessage[] = [];

    const inboundPromise = new Promise<void>((resolve) => {
      const unsubscribe = handle.onMessage((message) => {
        inbound.push(message);
        if (message === "ws-fallback") {
          unsubscribe();
          resolve();
        }
      });
    });

    await remoteReady;
    await remoteSession?.send("ws-fallback");
      await inboundPromise;

      expect(inbound).toContain("ws-fallback");
      await handle.disconnect();
      expect(endpoints).toContain("ws://fallback.test/ws");
      await controller.teardown();
    });

  it("clears stale connections when the driver closes and allows reconnect", async () => {
    const stateTransitions: TransportState[] = [];
    const sendInvocations: number[] = [];

    const driverContext: { emitState: ((state: TransportState) => void) | null } = {
      emitState: null,
    };

    const createClosingDriver = (): TransportDependencies["createWebRTC"] => {
      let connectionId = 0;

      return async ({ emitMessage, signal, options, emitState }) => {
        const sessionId =
          typeof options?.metadata?.peerSessionId === "string"
            ? options.metadata.peerSessionId
            : "default-peer-session";

        const remoteSession = await createPeerCryptoSession({
          sessionId,
          onPlaintext: (payload) => emitMessage(payload),
        });

        remoteSession.attachTransmitter(async (payload) => {
          emitMessage(payload);
        });

        const currentId = ++connectionId;
        driverContext.emitState = emitState;

        const abortHandler = () => {
          void remoteSession.teardown();
        };

        signal.addEventListener("abort", abortHandler, { once: true });

        return {
          async send(payload) {
            sendInvocations.push(currentId);
            await remoteSession.receive(payload);
          },
          async close() {
            signal.removeEventListener("abort", abortHandler);
            await remoteSession.teardown();
          },
        } satisfies {
          send: (payload: TransportMessage) => Promise<void>;
          close: () => Promise<void>;
        };
      };
    };

    const dependencies: TransportDependencies = {
      createWebRTC: createClosingDriver(),
    };

    const controller = initializeMessagingTransport({ dependencies });
    await controller.whenReady();

    const handle = controller.transport as TransportHandle;
    const unsubscribe = handle.onStateChange((state) => stateTransitions.push(state));

    await handle.send("first-message");

    driverContext.emitState?.("closed");

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(handle.send("after-close")).rejects.toThrow("Transport is not connected");
    const initialConnectionId = Math.max(...sendInvocations);

    await handle.connect();
    await handle.send("after-reconnect");

    expect(Math.max(...sendInvocations)).toBeGreaterThan(initialConnectionId);
    expect(stateTransitions).toContain("closed");

    unsubscribe();
    await controller.teardown();
  });

  it("does not emit mode changes when a swap fails", async () => {
    const dependencies: TransportDependencies = {
      createWebRTC: createMockDriver("progressive"),
    };

    const createStubHandle = (
      mode: MessagingMode,
      connectImpl: () => Promise<void> | void,
    ): TransportHandle => {
      let state: TransportState = "idle";
      const noop = () => () => undefined;

      return {
        mode,
        get state() {
          return state;
        },
        ready: Promise.resolve(),
        async connect() {
          state = "connecting";
          try {
            await connectImpl();
            state = "connected";
          } catch (error) {
            state = "error";
            throw error;
          }
        },
        async disconnect() {
          state = "closed";
        },
        async send() {
          throw new Error("noop");
        },
        onMessage: noop,
        onStateChange: noop,
        onError: noop,
      };
    };

    const onModeChange = mock((mode: MessagingMode) => mode);
    const controller = initializeMessagingTransport({
      dependencies,
      onModeChange,
      factories: {
        udp: () =>
          createStubHandle("udp", () => {
            throw new TransportUnavailableError("udp unavailable");
          }),
      },
    });
    await controller.whenReady();

    const initialCalls = onModeChange.mock.calls.length;

    let success: boolean | undefined;
    try {
      success = await controller.switchMode("udp");
    } catch (error) {
      expect(error).toBeInstanceOf(TransportUnavailableError);
      success = false;
    }

    expect(success).toBe(false);

    expect(onModeChange.mock.calls.length).toBe(initialCalls);
    expect(controller.mode).toBe("progressive");
  });

  it("refreshes the mode using stored preferences", async () => {
    const dependencies: TransportDependencies = {
      createWebRTC: createMockDriver("progressive"),
      udpConnector: {
        async join({ signal } = {}) {
          const sessionId = "default-peer-session";

          let controller: ReadableStreamDefaultController<TransportMessage> | null = null;
          const readable = new ReadableStream<TransportMessage>({
            start(ctrl) {
              controller = ctrl;
            },
            cancel() {
              controller = null;
            },
          });

          const remoteSession = await createPeerCryptoSession({
            sessionId,
            onPlaintext: (payload) => {
              controller?.enqueue(payload);
            },
          });

          remoteSession.attachTransmitter(async (payload) => {
            controller?.enqueue(payload);
          });

          let timer: ReturnType<typeof setTimeout> | null = null;

          const abortHandler = () => {
            if (timer) {
              clearTimeout(timer);
              timer = null;
            }
            controller?.close();
            void remoteSession.teardown();
          };

          signal?.addEventListener("abort", abortHandler, { once: true });

          void remoteSession
            .whenReady()
            .then(() => {
              timer = setTimeout(() => {
                void remoteSession.send("udp-message").catch(() => undefined);
              }, 0);
            })
            .catch(() => undefined);

          return {
            async send(payload: TransportMessage) {
              await remoteSession.receive(payload);
            },
            async close() {
              signal?.removeEventListener("abort", abortHandler);
              if (timer) {
                clearTimeout(timer);
                timer = null;
              }
              controller?.close();
              await remoteSession.teardown();
            },
            readable,
          };
        },
      },
    };

    const controller = initializeMessagingTransport({ dependencies });
    await controller.whenReady();

    const storage = (globalThis.window.localStorage as { setItem: (key: string, value: string) => void }).setItem.bind(
      globalThis.window.localStorage,
    );
    storage("site-messaging-mode", "udp");

    await controller.refresh();
    expect(controller.mode).toBe("udp");
    const handle = controller.transport as TransportHandle;
    const inbound: TransportMessage[] = [];
    handle.onMessage((message) => inbound.push(message));

    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(inbound).toContain("udp-message");
  });

  it("sends manual WebRTC handshake frames while connecting", async () => {
    const signalingController = createPeerSignalingController();
    signalingController.setRole("host");
    const manualDependencies = signalingController.createDependencies();

    const handshakeStates: TransportState[] = [];
    const handshakeFrames: PeerHandshakeFrame["handshake"][] = [];

    const decodeBase64 = (value: string) => Buffer.from(value, "base64").toString("utf-8");
    const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");

    let currentHandle: TransportHandle | null = null;
    const getHandleState = () => currentHandle?.state ?? "connecting";

    const dependencies: TransportDependencies = {
      signaling: manualDependencies.signaling,
      async createWebRTC({ emitMessage, signal, options }) {
        const sessionId =
          typeof options?.metadata?.peerSessionId === "string"
            ? options.metadata.peerSessionId
            : "default-peer-session";

        const remoteSession = await createPeerCryptoSession({
          sessionId,
          onPlaintext: (payload) => emitMessage(payload),
        });

        remoteSession.attachTransmitter(async (payload) => {
          emitMessage(payload);
        });

        const abortHandler = () => {
          void remoteSession.teardown();
        };

        signal.addEventListener("abort", abortHandler, { once: true });

        void manualDependencies.signaling?.negotiate(
          { type: "offer", sdp: "dummy-offer" },
          options,
        );

        void remoteSession
          .whenReady()
          .then(() => {
            signal.removeEventListener("abort", abortHandler);
            return remoteSession.send("connected");
          })
          .catch(() => undefined);

        return {
          async send(payload) {
            const state = getHandleState();
            if (typeof payload === "string") {
              try {
                const parsed = JSON.parse(payload) as PeerHandshakeFrame;
                if (parsed?.type === "handshake") {
                  handshakeStates.push(state);
                  handshakeFrames.push(parsed.handshake);
                  return;
                }
              } catch {
                // ignore parse errors
              }
            }

            await remoteSession.receive(payload);
          },
          async close() {
            signal.removeEventListener("abort", abortHandler);
            await remoteSession.teardown();
          },
        };
      },
    };

    const controller = initializeMessagingTransport({
      dependencies,
      connectOptions: { metadata: { peerSessionId: "manual-session" } },
    });

    await Promise.resolve();
    currentHandle = controller.transport;
    expect(currentHandle).not.toBeNull();

    if (currentHandle) {
      signalingController.setActiveTransport(currentHandle);
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Handshake frame was not sent"));
      }, 500);

      const check = () => {
        if (handshakeFrames.length > 0) {
          clearTimeout(timeout);
          resolve();
        } else {
          setTimeout(check, 10);
        }
      };

      check();
    });

    expect(handshakeFrames.length).toBeGreaterThan(0);
    expect(handshakeStates).toContain("connecting");

    const offer = handshakeFrames[0];
    expect(offer.kind).toBe("offer");
    const offerPayload = JSON.parse(decodeBase64(offer.token)) as {
      sessionId: string;
    };

    const answerToken = encodeBase64(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "answer",
        description: { type: "answer", sdp: "dummy-answer" },
        sessionId: offerPayload.sessionId,
        createdAt: Date.now(),
      }),
    );

    await signalingController.setRemoteAnswer(answerToken);
    await controller.whenReady();

    const handle = controller.transport;
    expect(handle?.state).toBe("connected");

    await controller.teardown();
    signalingController.setActiveTransport(null);
  });

  it(
    "retries handshake frames when the transport send rejects during bootstrap",
    async () => {
      const signalingController = createPeerSignalingController();
      signalingController.setRole("host");
      const manualDependencies = signalingController.createDependencies();

      const handshakeFrames: PeerHandshakeFrame["handshake"][] = [];
      let currentHandle: TransportHandle | null = null;

      let bootstrapFailures = 1;

      const dependencies: TransportDependencies = {
        signaling: manualDependencies.signaling,
        async createWebRTC({ emitMessage, signal, options }) {
          const sessionId =
            typeof options?.metadata?.peerSessionId === "string"
              ? options.metadata.peerSessionId
              : "default-peer-session";

          const remoteSession = await createPeerCryptoSession({
            sessionId,
            onPlaintext: (payload) => {
              if (typeof payload === "string") {
                try {
                  const parsed = JSON.parse(payload) as PeerHandshakeFrame;
                  if (parsed?.type === "handshake") {
                    handshakeFrames.push(parsed.handshake);
                  }
                } catch {
                  // Ignore parse failures
                }
              }
              emitMessage(payload);
            },
          });

          remoteSession.attachTransmitter(async (payload) => {
            emitMessage(payload);
          });

          const abortHandler = () => {
            void remoteSession.teardown();
          };

          signal.addEventListener("abort", abortHandler, { once: true });

          void manualDependencies.signaling?.negotiate(
            { type: "offer", sdp: "bootstrap-offer" },
            options,
          );

          void remoteSession
            .whenReady()
            .then(() => {
              signal.removeEventListener("abort", abortHandler);
              return remoteSession.send("connected");
            })
            .catch(() => undefined);

          return {
            async send(payload) {
              if (typeof payload === "string") {
                try {
                  const parsed = JSON.parse(payload) as PeerHandshakeFrame;
                  if (parsed?.type === "handshake") {
                    if (bootstrapFailures > 0) {
                      bootstrapFailures -= 1;
                      throw new Error("Transport is not connected");
                    }
                    return;
                  }
                } catch {
                  // Ignore parse failures
                }
              }

              await remoteSession.receive(payload);
            },
            async close() {
              signal.removeEventListener("abort", abortHandler);
              await remoteSession.teardown();
            },
          };
        },
      };

      const controller = initializeMessagingTransport({
        dependencies,
        connectOptions: { metadata: { peerSessionId: "bootstrap-session" } },
      });

      await Promise.resolve();
      currentHandle = controller.transport;
      expect(currentHandle).not.toBeNull();

      if (!currentHandle) {
        throw new Error("Transport handle was not created");
      }

      signalingController.setActiveTransport(currentHandle);

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Handshake frame was not delivered"));
        }, 7_000);

        const verify = () => {
          if (handshakeFrames.length > 0 && currentHandle?.state === "connected") {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 25);
        };

        verify();
      });

      expect(handshakeFrames.length).toBeGreaterThan(0);
      expect(bootstrapFailures).toBe(0);
      expect(currentHandle.state).toBe("connected");

      await controller.teardown();
      signalingController.setActiveTransport(null);
    },
    10_000,
  );

  it(
    "keeps sending handshake frames until the peer responds even after many retries",
    async () => {
      const globalScope = globalThis as {
        __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
      };
      const previousRetryInterval = globalScope.__PEER_HANDSHAKE_RETRY_INTERVAL__;
      globalScope.__PEER_HANDSHAKE_RETRY_INTERVAL__ = 10;

      const signalingController = createPeerSignalingController();
      signalingController.setRole("host");

      const manualDependencies = signalingController.createDependencies();
      const decodeBase64 = (value: string) => Buffer.from(value, "base64").toString("utf-8");
      const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");

      const ignoredHandshakes = 5;
      const handshakeFrames: PeerHandshakeFrame["handshake"][] = [];
      let handshakeCount = 0;
      let offerToken: string | null = null;
      let answered = false;

      const transport: TransportHandle = {
        mode: "manual",
        state: "connecting",
        ready: Promise.resolve(),
        async connect() {},
        async disconnect() {},
        async send(payload) {
          if (typeof payload === "string") {
            try {
              const parsed = JSON.parse(payload) as PeerHandshakeFrame;
              if (parsed?.type === "handshake") {
                handshakeFrames.push(parsed.handshake);
                handshakeCount += 1;
                if (!offerToken && parsed.handshake.kind === "offer") {
                  offerToken = parsed.handshake.token;
                }
                if (handshakeCount > ignoredHandshakes) {
                  await respondWithAnswer();
                }
                return;
              }
            } catch {
              // Ignore parse failures
            }
          }
        },
        onMessage() {
          return () => undefined;
        },
        onStateChange() {
          return () => undefined;
        },
        onError() {
          return () => undefined;
        },
      };

      const respondWithAnswer = async () => {
        if (answered || !offerToken) return;
        answered = true;
        transport.state = "connected";
        const offerPayload = JSON.parse(decodeBase64(offerToken));
        const answerToken = encodeBase64(
          JSON.stringify({
            type: "goguma-peer-invite",
            kind: "answer",
            description: { type: "answer", sdp: "slow-answer" },
            sessionId: offerPayload.sessionId,
            createdAt: Date.now(),
          }),
        );
        await signalingController.setRemoteAnswer(answerToken);
      };

      const negotiationPromise = manualDependencies.signaling?.negotiate(
        { type: "offer", sdp: "slow-offer" },
        { metadata: { peerSessionId: "slow-retry-session" } },
      );
      if (!negotiationPromise) {
        throw new Error("Manual signaling was not initialized");
      }

      try {
        signalingController.setActiveTransport(transport);

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Handshake retries did not complete"));
          }, 2_000);

          const verify = () => {
            if (handshakeCount > ignoredHandshakes && answered) {
              clearTimeout(timeout);
              resolve();
              return;
            }
            setTimeout(verify, 10);
          };

          verify();
        });

        await negotiationPromise;

        expect(handshakeCount).toBeGreaterThan(ignoredHandshakes);
        expect(handshakeFrames.length).toBeGreaterThan(ignoredHandshakes);
        expect(answered).toBe(true);
      } finally {
        signalingController.setActiveTransport(null);
        if (previousRetryInterval === undefined) {
          delete globalScope.__PEER_HANDSHAKE_RETRY_INTERVAL__;
        } else {
          globalScope.__PEER_HANDSHAKE_RETRY_INTERVAL__ = previousRetryInterval;
        }
      }
    },
    5_000,
  );

  it("retains negotiated tokens on disconnect and avoids republishing until reset", async () => {
    const signalingController = createPeerSignalingController();
    signalingController.setRole("host");
    const manualDependencies = signalingController.createDependencies();

    const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");
    const decodeBase64 = (value: string) => Buffer.from(value, "base64").toString("utf-8");

    const handshakeFrames: PeerHandshakeFrame["handshake"][] = [];
    const transport: TransportHandle = {
      mode: "progressive" as MessagingMode,
      state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              handshakeFrames.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

    signalingController.setActiveTransport(transport);

    const negotiationPromise = manualDependencies.signaling?.negotiate(
      { type: "offer", sdp: "reconnect-offer" },
      { metadata: { peerSessionId: "reconnect-session" } },
    );
    if (!negotiationPromise) {
      throw new Error("Manual signaling was not initialized");
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Handshake frame was not sent"));
      }, 500);

      const verify = () => {
        if (handshakeFrames.length > 0) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(verify, 10);
      };

      verify();
    });

    const offerPayload = JSON.parse(decodeBase64(handshakeFrames[0].token));
    const answerToken = encodeBase64(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "answer",
        description: { type: "answer", sdp: "fresh-answer" },
        sessionId: offerPayload.sessionId,
        createdAt: Date.now(),
      }),
    );

    await signalingController.setRemoteAnswer(answerToken);

    const negotiatedAnswer = await negotiationPromise;
    expect(negotiatedAnswer.sdp).toBe("fresh-answer");

    const handshakeCountAfterAnswer = handshakeFrames.length;
    const sessionBeforeDisconnect = signalingController.getSnapshot().sessionId;

    signalingController.markDisconnected();

    const disconnectedSnapshot = signalingController.getSnapshot();
    expect(disconnectedSnapshot.remoteAnswer).toBe(answerToken);
    expect(disconnectedSnapshot.sessionId).toBe(sessionBeforeDisconnect);
    expect(disconnectedSnapshot.connected).toBe(false);

    const reconnectTransport: TransportHandle = {
      ...transport,
      send: transport.send,
    };

    signalingController.setActiveTransport(reconnectTransport);

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(handshakeFrames.length).toBe(handshakeCountAfterAnswer);

    signalingController.setRole("guest");

    expect(signalingController.getSnapshot().remoteAnswer).toBeNull();
    expect(signalingController.getSnapshot().sessionId).not.toBe(sessionBeforeDisconnect);

    signalingController.setActiveTransport(null);
  });

  it("restores awaitingOffer state from persisted peer signaling data", () => {
    const storageKey = "peer-signaling-state-awaiting-offer";
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("guest");

    expect(controller.getSnapshot().awaitingOffer).toBe(true);

    const restored = createPeerSignalingController(storageKey);
    restored.hydrateFromStorage();

    const snapshot = restored.getSnapshot();
    expect(snapshot.awaitingOffer).toBe(true);
    expect(snapshot.role).toBe("guest");
  });

  it("restores awaitingAnswer state from persisted peer signaling data", () => {
    const storageKey = "peer-signaling-state-awaiting-answer";
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("host");

    const dependencies = controller.createDependencies();
    dependencies.signaling
      ?.negotiate({ type: "offer", sdp: "dummy-offer" })
      .catch(() => undefined);

    expect(controller.getSnapshot().awaitingAnswer).toBe(true);

    const restored = createPeerSignalingController(storageKey);
    restored.hydrateFromStorage();

    const snapshot = restored.getSnapshot();
    expect(snapshot.awaitingAnswer).toBe(true);
    expect(snapshot.role).toBe("host");
  });

  it("resends persisted offer handshakes after hydration", async () => {
    const storageKey = `peer-signaling-state:host-${Date.now()}`;
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("host");
    const manualDependencies = controller.createDependencies();

    const capturedHandshakes: PeerHandshakeFrame["handshake"][] = [];
    const transport: TransportHandle = {
      mode: "manual" as MessagingMode,
      state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              capturedHandshakes.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

    controller.setActiveTransport(transport);
    manualDependencies.signaling
      ?.negotiate(
        { type: "offer", sdp: "persisted-offer" },
        { metadata: { peerSessionId: "persisted-offer-session" } },
      )
      .catch(() => undefined);

    const teardown = () => {
      (globalThis.window.localStorage as { storage: Map<string, string> }).storage.delete(storageKey);
    };

    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("handshake not captured")), 500);
        const verify = () => {
          if (capturedHandshakes.length > 0) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 10);
        };
        verify();
      });

      const originalHandshake = capturedHandshakes[0];
      expect(originalHandshake.kind).toBe("offer");

      controller.setActiveTransport(null);

      const restoredController = createPeerSignalingController(storageKey);
      const resentHandshakes: PeerHandshakeFrame["handshake"][] = [];
      const restoredTransport: TransportHandle = {
        mode: "manual" as MessagingMode,
        state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              resentHandshakes.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

      restoredController.setActiveTransport(restoredTransport);
      restoredController.hydrateFromStorage();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("handshake not resent")), 500);
        const verify = () => {
          if (resentHandshakes.length > 0) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 10);
        };
        verify();
      });

      expect(resentHandshakes[0]?.token).toBe(originalHandshake.token);

      restoredController.setActiveTransport(null);
    } finally {
      teardown();
    }
  });

  it("continues resending persisted offers after hydration until a remote answer arrives", async () => {
    const storageKey = `peer-signaling-state:offer-retry-${Date.now()}`;
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("host");

    const dependencies = controller.createDependencies();
    dependencies.signaling
      ?.negotiate(
        { type: "offer", sdp: "persisted-offer" },
        { metadata: { peerSessionId: "persisted-offer-session" } },
      )
      .catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("offer not persisted")), 500);
      const verify = () => {
        if (controller.getSnapshot().localOfferToken) {
          clearTimeout(timeout);
          resolve();
          return;
        }
        setTimeout(verify, 10);
      };
      verify();
    });

    controller.setActiveTransport(null);

    const previousInterval = (globalThis as {
      __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
    }).__PEER_HANDSHAKE_RETRY_INTERVAL__;
    (globalThis as {
      __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
    }).__PEER_HANDSHAKE_RETRY_INTERVAL__ = 10;

    const decodeBase64 = (value: string) => Buffer.from(value, "base64").toString("utf-8");
    const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");

    const restoredController = createPeerSignalingController(storageKey);
    const resentHandshakes: PeerHandshakeFrame["handshake"][] = [];
    const restoredTransport: TransportHandle = {
      mode: "manual" as MessagingMode,
      state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              resentHandshakes.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

    const teardown = () => {
      (globalThis.window.localStorage as { storage: Map<string, string> }).storage.delete(storageKey);
      (globalThis as {
        __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
      }).__PEER_HANDSHAKE_RETRY_INTERVAL__ = previousInterval;
    };

    try {
      restoredController.setActiveTransport(restoredTransport);
      restoredController.hydrateFromStorage();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("offer did not retry")), 500);
        const verify = () => {
          if (resentHandshakes.length >= 2) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 5);
        };
        verify();
      });

      const lastOffer = resentHandshakes[resentHandshakes.length - 1]!;
      const offerPayload = JSON.parse(decodeBase64(lastOffer.token)) as {
        sessionId: string;
      };
      const answerToken = encodeBase64(
        JSON.stringify({
          type: "goguma-peer-invite",
          kind: "answer",
          description: { type: "answer", sdp: "persisted-answer" },
          sessionId: offerPayload.sessionId,
          createdAt: Date.now(),
        }),
      );

      await restoredController.setRemoteAnswer(answerToken);

      const countAfterAnswer = resentHandshakes.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(resentHandshakes.length).toBe(countAfterAnswer);

      restoredController.setActiveTransport(null);
    } finally {
      teardown();
    }
  });

  it("resends persisted answer handshakes after hydration", async () => {
    const storageKey = `peer-signaling-state:guest-${Date.now()}`;
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("guest");

    const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");
    const offerToken = encodeBase64(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "offer",
        description: { type: "offer", sdp: "persisted-offer" },
        sessionId: "persisted-offer-session",
        createdAt: Date.now(),
      }),
    );

    await controller.setRemoteInvite(offerToken);

    const capturedHandshakes: PeerHandshakeFrame["handshake"][] = [];
    const transport: TransportHandle = {
      mode: "manual" as MessagingMode,
      state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              capturedHandshakes.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

    controller.setActiveTransport(transport);
    const manualDependencies = controller.createDependencies();

    class MockRTCDataChannel {
      readonly readyState = "open" as const;
      binaryType = "arraybuffer";
      #listeners = new Map<string, Set<(event: Event) => void>>();

      addEventListener(type: string, listener: (event: Event) => void) {
        if (!this.#listeners.has(type)) {
          this.#listeners.set(type, new Set());
        }
        this.#listeners.get(type)!.add(listener);
        if (type === "open") {
          setTimeout(() => listener({ type: "open" } as Event), 0);
        }
      }

      removeEventListener(type: string, listener: (event: Event) => void) {
        this.#listeners.get(type)?.delete(listener);
      }

      send() {}

      close() {
        this.#listeners.get("close")?.forEach((handler) => handler({ type: "close" } as Event));
      }
    }

    class MockRTCPeerConnection {
      ondatachannel: ((event: { channel: MockRTCDataChannel }) => void) | null = null;
      #channel = new MockRTCDataChannel();

      async setRemoteDescription() {
        setTimeout(() => {
          this.ondatachannel?.({ channel: this.#channel });
        }, 0);
      }

      async createAnswer() {
        return { type: "answer", sdp: "persisted-answer" } as RTCSessionDescriptionInit;
      }

      async setLocalDescription() {}

      close() {}
    }

    const previousRTC = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
    (globalThis as { RTCPeerConnection: unknown }).RTCPeerConnection = MockRTCPeerConnection;

    try {
      const connectionPromise = manualDependencies.createWebRTC?.({
        signal: new AbortController().signal,
        emitMessage() {},
        emitState() {},
        emitError() {},
        options: {},
      });

      if (!connectionPromise) {
        throw new Error("Manual WebRTC dependencies were not created");
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("answer handshake not captured")), 500);
        const verify = () => {
          if (capturedHandshakes.length > 0) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 10);
        };
        verify();
      });

      const originalHandshake = capturedHandshakes[0];
      expect(originalHandshake.kind).toBe("answer");

      const connection = await connectionPromise;
      await connection.close();

      controller.setActiveTransport(null);

      const restoredController = createPeerSignalingController(storageKey);
      const resentHandshakes: PeerHandshakeFrame["handshake"][] = [];
      const restoredTransport: TransportHandle = {
        mode: "manual" as MessagingMode,
        state: "connecting",
        ready: Promise.resolve(),
        async connect() {},
        async disconnect() {},
        async send(payload) {
          if (typeof payload === "string") {
            try {
              const parsed = JSON.parse(payload) as PeerHandshakeFrame;
              if (parsed?.type === "handshake") {
                resentHandshakes.push(parsed.handshake);
                return;
              }
            } catch {
              // Ignore parse errors
            }
          }
        },
        onMessage() {
          return () => undefined;
        },
        onStateChange() {
          return () => undefined;
        },
        onError() {
          return () => undefined;
        },
      };

      restoredController.setActiveTransport(restoredTransport);
      restoredController.hydrateFromStorage();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("answer handshake not resent")), 500);
        const verify = () => {
          if (resentHandshakes.length > 0) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 10);
        };
        verify();
      });

      expect(resentHandshakes[0]?.token).toBe(originalHandshake.token);

      restoredController.setActiveTransport(null);
    } finally {
      if (previousRTC) {
        (globalThis as { RTCPeerConnection: unknown }).RTCPeerConnection = previousRTC;
      } else {
        delete (globalThis as Record<string, unknown>).RTCPeerConnection;
      }
      (globalThis.window.localStorage as { storage: Map<string, string> }).storage.delete(storageKey);
    }
  });

  it("continues resending persisted answers after hydration until the connection is established", async () => {
    const storageKey = `peer-signaling-state:answer-retry-${Date.now()}`;
    const controller = createPeerSignalingController(storageKey);
    controller.setRole("guest");

    const encodeBase64 = (value: string) => Buffer.from(value, "utf-8").toString("base64");
    const offerToken = encodeBase64(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "offer",
        description: { type: "offer", sdp: "persisted-offer" },
        sessionId: "persisted-offer-session",
        createdAt: Date.now(),
      }),
    );

    await controller.setRemoteInvite(offerToken);

    const manualDependencies = controller.createDependencies();

    class MockRTCDataChannel {
      readonly readyState = "open" as const;
      binaryType = "arraybuffer";
      #listeners = new Map<string, Set<(event: Event) => void>>();

      addEventListener(type: string, listener: (event: Event) => void) {
        if (!this.#listeners.has(type)) {
          this.#listeners.set(type, new Set());
        }
        this.#listeners.get(type)!.add(listener);
        if (type === "open") {
          setTimeout(() => listener({ type: "open" } as Event), 0);
        }
      }

      removeEventListener(type: string, listener: (event: Event) => void) {
        this.#listeners.get(type)?.delete(listener);
      }

      send() {}

      close() {
        this.#listeners.get("close")?.forEach((handler) => handler({ type: "close" } as Event));
      }
    }

    class MockRTCPeerConnection {
      ondatachannel: ((event: { channel: MockRTCDataChannel }) => void) | null = null;
      #channel = new MockRTCDataChannel();

      async setRemoteDescription() {
        setTimeout(() => {
          this.ondatachannel?.({ channel: this.#channel });
        }, 0);
      }

      async createAnswer() {
        return { type: "answer", sdp: "persisted-answer" } as RTCSessionDescriptionInit;
      }

      async setLocalDescription() {}

      close() {}
    }

    const previousRTC = (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection;
    (globalThis as { RTCPeerConnection: unknown }).RTCPeerConnection = MockRTCPeerConnection;

    try {
      const connectionPromise = manualDependencies.createWebRTC?.({
        signal: new AbortController().signal,
        emitMessage() {},
        emitState() {},
        emitError() {},
        options: {},
      });

      if (!connectionPromise) {
        throw new Error("Manual WebRTC dependencies were not created");
      }

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("answer not persisted")), 500);
        const verify = () => {
          if (controller.getSnapshot().localAnswerToken) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 10);
        };
        verify();
      });

      const connection = await connectionPromise;
      await connection.close();
    } finally {
      if (previousRTC) {
        (globalThis as { RTCPeerConnection: unknown }).RTCPeerConnection = previousRTC;
      } else {
        delete (globalThis as Record<string, unknown>).RTCPeerConnection;
      }
    }

    const previousInterval = (globalThis as {
      __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
    }).__PEER_HANDSHAKE_RETRY_INTERVAL__;
    (globalThis as {
      __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
    }).__PEER_HANDSHAKE_RETRY_INTERVAL__ = 10;

    const restoredController = createPeerSignalingController(storageKey);
    const resentHandshakes: PeerHandshakeFrame["handshake"][] = [];
    const restoredTransport: TransportHandle = {
      mode: "manual" as MessagingMode,
      state: "connecting",
      ready: Promise.resolve(),
      async connect() {},
      async disconnect() {},
      async send(payload) {
        if (typeof payload === "string") {
          try {
            const parsed = JSON.parse(payload) as PeerHandshakeFrame;
            if (parsed?.type === "handshake") {
              resentHandshakes.push(parsed.handshake);
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      },
      onMessage() {
        return () => undefined;
      },
      onStateChange() {
        return () => undefined;
      },
      onError() {
        return () => undefined;
      },
    };

    const teardown = () => {
      (globalThis.window.localStorage as { storage: Map<string, string> }).storage.delete(storageKey);
      (globalThis as {
        __PEER_HANDSHAKE_RETRY_INTERVAL__?: number;
      }).__PEER_HANDSHAKE_RETRY_INTERVAL__ = previousInterval;
    };

    try {
      restoredController.setActiveTransport(restoredTransport);
      restoredController.hydrateFromStorage();

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("answer did not retry")), 500);
        const verify = () => {
          if (resentHandshakes.length >= 2) {
            clearTimeout(timeout);
            resolve();
            return;
          }
          setTimeout(verify, 5);
        };
        verify();
      });

      restoredController.markConnected();

      const countAfterConnected = resentHandshakes.length;
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(resentHandshakes.length).toBe(countAfterConnected);

      restoredController.setActiveTransport(null);
    } finally {
      teardown();
    }
  });
  it("applies offer handshakes delivered via broadcast channel", async () => {
    const hostController = createPeerSignalingController("broadcast-offer-host");
    hostController.setRole("host");
    const guestController = createPeerSignalingController("broadcast-offer-guest");
    guestController.setRole("guest");

    const hostSessionId = hostController.getSnapshot().sessionId;
    const offerToken = Buffer.from(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "offer",
        description: { type: "offer", sdp: "broadcast-offer" },
        sessionId: hostSessionId,
        createdAt: Date.now(),
      }),
      "utf-8",
    ).toString("base64");

    const waitForInvite = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Offer handshake not applied")), 500);
      const unsubscribe = guestController.subscribe((snapshot) => {
        if (snapshot.remoteInvite === offerToken) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

    const channel = new BroadcastChannel("goguma-peer-handshake");
    channel.postMessage({
      handshake: { kind: "offer", token: offerToken },
      senderSessionId: hostSessionId,
      timestamp: Date.now(),
    });

    await waitForInvite;
    expect(guestController.getSnapshot().remoteInvite).toBe(offerToken);
  });

  it("applies answer handshakes delivered via broadcast channel", async () => {
    const hostController = createPeerSignalingController("broadcast-answer-host");
    hostController.setRole("host");
    const guestController = createPeerSignalingController("broadcast-answer-guest");
    guestController.setRole("guest");

    const manualDependencies = hostController.createDependencies();
    void manualDependencies.signaling?.negotiate({ type: "offer", sdp: "need-answer" });

    const guestSessionId = guestController.getSnapshot().sessionId;
    const answerToken = Buffer.from(
      JSON.stringify({
        type: "goguma-peer-invite",
        kind: "answer",
        description: { type: "answer", sdp: "broadcast-answer" },
        sessionId: guestSessionId,
        createdAt: Date.now(),
      }),
      "utf-8",
    ).toString("base64");

    const waitForAnswer = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Answer handshake not applied")), 500);
      const unsubscribe = hostController.subscribe((snapshot) => {
        if (snapshot.remoteAnswer === answerToken) {
          clearTimeout(timeout);
          unsubscribe();
          resolve();
        }
      });
    });

    const channel = new BroadcastChannel("goguma-peer-handshake");
    channel.postMessage({
      handshake: { kind: "answer", token: answerToken },
      senderSessionId: guestSessionId,
      timestamp: Date.now(),
    });

    await waitForAnswer;
    expect(hostController.getSnapshot().remoteAnswer).toBe(answerToken);
  });
});
