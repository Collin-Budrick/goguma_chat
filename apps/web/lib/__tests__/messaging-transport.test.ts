import { describe, expect, it, beforeEach, afterEach, mock } from "bun:test";

import {
  initializeMessagingTransport,
  TransportDependencies,
  TransportHandle,
  TransportMessage,
  TransportState,
  TransportUnavailableError,
} from "../messaging-transport";
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
    async ({ emitMessage, signal }) => {
      const outbound: TransportMessage[] = [];
      const timer = setTimeout(() => emitMessage(`${label}-hello`), 0);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
        },
        { once: true },
      );

      return {
        async send(payload) {
          outbound.push(payload);
        },
        async close() {
          clearTimeout(timer);
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
    const unsubscribeMessage = handle.onMessage((message) => inbound.push(message));

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(inbound).toContain("progressive-hello");
    expect(handle.state).toBe("connected");

    unsubscribeMessage();
  });

  it("falls back to WebTransport when WebRTC connection fails", async () => {
    const webrtcError = new Error("webrtc failed");
    const dependencies: TransportDependencies = {
      createWebRTC: async () => {
        throw webrtcError;
      },
      createWebTransport: async ({ emitMessage, signal }) => {
        const timer = setTimeout(() => emitMessage("fallback"), 0);
        signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
          },
          { once: true },
        );

        return {
          async send() {
            /* noop */
          },
          async close() {
            clearTimeout(timer);
          },
        };
      },
    };

    const controller = initializeMessagingTransport({ dependencies });
    await controller.whenReady();
    const handle = controller.transport as TransportHandle;
    const received: TransportMessage[] = [];
    handle.onMessage((message) => received.push(message));

    await new Promise((resolve) => setTimeout(resolve, 5));

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
        async join() {
          return {
            async send() {
              /* noop */
            },
            async close() {
              /* noop */
            },
            readable: new ReadableStream<TransportMessage>({
              start(controller) {
                setTimeout(() => controller.enqueue("udp-message"), 0);
              },
            }),
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

    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(inbound).toContain("udp-message");
  });
});
