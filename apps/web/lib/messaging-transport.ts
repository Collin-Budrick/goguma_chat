"use client";

import {
  type MessagingMode,
  MESSAGING_MODE_EVENT,
  loadMessagingMode,
} from "./messaging-mode";

export type TransportMessage =
  | string
  | ArrayBuffer
  | ArrayBufferView
  | Blob;

export type TransportState =
  | "idle"
  | "connecting"
  | "connected"
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
  let state: TransportState = "idle";
  let connection: DriverConnection | null = null;
  let controller = new AbortController();
  let readyResolve: (() => void) | undefined;
  let readyReject: ((reason: unknown) => void) | undefined;
  let readySettled = false;
  let readyPromise: Promise<void> = new Promise((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const messageEmitter = createEmitter<TransportMessage>();
  const stateEmitter = createEmitter<TransportState>();
  const errorEmitter = createEmitter<Error>();

  const updateState = (next: TransportState) => {
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
    if (state === "connected") return;

    if (controller.signal.aborted) {
      controller = new AbortController();
    }

    updateState("connecting");

    try {
      connection = await driver.start({
        signal: controller.signal,
        options,
        emitMessage: (payload) => messageEmitter.emit(payload),
        emitState: updateState,
        emitError: (error) => errorEmitter.emit(error),
      });

      if (controller.signal.aborted) {
        throw createAbortError();
      }

      updateState("connected");
      fulfillReady();
    } catch (error) {
      updateState("error");
      const normalized = normalizeError(error);
      errorEmitter.emit(normalized);
      rejectReady(normalized);
      throw normalized;
    }
  };

  const disconnect: TransportHandle["disconnect"] = async () => {
    if (state === "closed") return;

    controller.abort();
    const activeConnection = connection;
    connection = null;

    try {
      if (activeConnection?.close) {
        await activeConnection.close();
      }
    } finally {
      updateState("closed");
    }

    // Prepare the handle for a potential reconnect by resetting the controller.
    controller = new AbortController();
  };

  const send: TransportHandle["send"] = async (payload) => {
    if (!connection) {
      throw new Error("Transport is not connected");
    }

    await connection.send(payload);
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
  webTransportEndpoint?: string | ((options?: TransportConnectOptions) => string);
  WebTransportConstructor?: new (url: string) => WebTransportLike;
  textEncoder?: () => TextEncoder;
};

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
  const { signal, emitMessage, emitError, dependencies, options } = startOptions;

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

  const offer = await peer.createOffer();
  await peer.setLocalDescription(offer);

  const answer = await negotiate(peer.localDescription as RTCSessionDescriptionInit, options);
  await peer.setRemoteDescription(answer);

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

    const webrtcFactory =
      dependencies.createWebRTC ?? ((options) => defaultCreateWebRTC(options));
    try {
      return await webrtcFactory(withDependencies);
    } catch (error) {
      startOptions.emitError(normalizeError(error));

      const webTransportFactory =
        dependencies.createWebTransport ?? ((options) => defaultCreateWebTransport(options));

      return webTransportFactory({
        ...withDependencies,
        endpoint: typeof dependencies.webTransportEndpoint === "function"
          ? dependencies.webTransportEndpoint(startOptions.options)
          : dependencies.webTransportEndpoint,
      });
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

    try {
      await nextHandle.connect(options.connectOptions);
      currentHandle = nextHandle;
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
