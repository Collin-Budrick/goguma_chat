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
  // eslint-disable-next-line no-var
  var __testWindowListeners: ListenerMap | undefined;
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
    },
  });
};

const uninstallWindow = () => {
  delete (globalThis as Record<string, unknown>).window;
  delete globalThis.__testWindowListeners;
};

describe("initializeMessagingTransport", () => {
  beforeEach(() => {
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
});
