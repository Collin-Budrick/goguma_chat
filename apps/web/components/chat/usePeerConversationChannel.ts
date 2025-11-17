"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type TransportHandle,
  type TransportMessage,
  emitPeerPresence,
} from "@/lib/messaging-transport";
import type {
  PeerPresenceUpdate,
  PeerHeartbeatFrame,
  PeerTransportIncomingFrame,
} from "@/lib/messaging-schema";

import type {
  ChatConversation,
  ChatMessage,
  TypingEvent,
} from "./types";
import { mergeMessages } from "./message-utils";
import {
  getConversationStorage,
  type ConversationSnapshot,
  type ConversationStorage,
} from "./conversation-storage";
import { postServiceWorkerMessage } from "@/lib/service-worker-messaging";
const ACK_TIMEOUT_MS = 7_000;
const HISTORY_TIMEOUT_MS = 10_000;
const HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_TIMEOUT_MS = 15_000;

type ChannelHistoryMode = "replace" | "prepend";

type ChannelEvent =
  | { type: "message"; message: ChatMessage; clientMessageId?: string | null }
  | {
      type: "history";
      mode: ChannelHistoryMode;
      messages: ChatMessage[];
      nextCursor: string | null;
    }
  | { type: "conversation"; conversation: ChatConversation | null }
  | { type: "presence"; presence: PeerPresenceUpdate }
  | { type: "error"; error: Error };

type ChannelListener = (event: ChannelEvent) => void;

type PendingEntry<T> = {
  resolve(value: T): void;
  reject(error: Error): void;
};

type SendMessageOptions = {
  conversationId: string;
  body: string;
  clientMessageId: string;
  optimisticMessage: ChatMessage;
};

type SendMessageResult = {
  message: ChatMessage;
};

type LoadMoreOptions = {
  conversationId: string;
  cursor: string | null;
  limit: number;
  signal?: AbortSignal;
};

type LoadMoreResult = {
  messages: ChatMessage[];
  nextCursor: string | null;
};

type SyncHistoryOptions = {
  friendId: string | null;
  limit: number;
  signal?: AbortSignal;
  initialConversation?: ChatConversation | null;
  initialMessages?: ChatMessage[];
  initialCursor?: string | null;
  conversationIdHint?: string | null;
};

type SyncHistoryResult = {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  nextCursor: string | null;
};

type PendingMap<T> = Map<string, PendingEntry<T>>;

const fallbackConversation: ConversationSnapshot = {
  conversation: null,
  messages: [],
  nextCursor: null,
  updatedAt: 0,
};

const parseTransportMessage = (
  payload: TransportMessage,
): PeerTransportIncomingFrame | null => {
  try {
    if (typeof payload === "string") {
      return JSON.parse(payload) as PeerTransportIncomingFrame;
    }

    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      const view = payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
      const text = new TextDecoder().decode(view);
      return JSON.parse(text) as PeerTransportIncomingFrame;
    }

    if (payload instanceof Blob) {
      return null;
    }
  } catch (error) {
    console.error("Failed to parse peer frame", error);
  }
  return null;
};

const createRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const normalizeError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(String(value ?? "Unknown error"));

const isTransportDisconnectedError = (value: unknown): value is Error =>
  value instanceof Error && value.message === "Transport is not connected";

type SendTypingPresenceOptions = {
  conversationId: string;
  typing: TypingEvent;
};

type SendReadReceiptPresenceOptions = {
  conversationId: string;
  userId: string;
  lastMessageId: string | null;
  readAt?: string;
};

type SendDeliveryPresenceOptions = {
  conversationId: string;
  userId: string;
  messageId: string;
  clientMessageId?: string | null;
  deliveredAt?: string;
};

export function usePeerConversationChannel(options: {
  transport: TransportHandle | null;
  onHeartbeatTimeout?: () => Promise<void>;
  directOnly?: boolean;
}) {
  const transportRef = useRef<TransportHandle | null>(options.transport);
  const listenersRef = useRef<Map<string, Set<ChannelListener>>>(new Map());
  const cacheRef = useRef<Map<string, ConversationSnapshot>>(new Map());
  const storagePromiseRef = useRef<
    Promise<ConversationStorage | null> | null
  >(null);
  const pendingAcksRef = useRef<PendingMap<ChatMessage>>(new Map());
  const pendingHistoryRef = useRef<PendingMap<SyncHistoryResult>>(new Map());
  const pendingLoadRef = useRef<PendingMap<LoadMoreResult>>(new Map());
  const outboundQueueRef = useRef<
    Array<{
      payload: {
        type: "message:send";
        conversationId: string;
        body: string;
        clientMessageId: string;
      };
    }>
  >([]);
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaitingHeartbeatAckRef = useRef(false);
  const heartbeatReadyRef = useRef(false);
  const heartbeatPrimedRef = useRef(false);
  const heartbeatRecoveryRef = useRef(false);

  const rejectAllPending = useCallback((error: Error) => {
    const rejectMap = <T,>(map: PendingMap<T>) => {
      if (!map.size) return;
      map.forEach((entry) => entry.reject(error));
    };
    rejectMap(pendingAcksRef.current);
    rejectMap(pendingHistoryRef.current);
    rejectMap(pendingLoadRef.current);
  }, []);

  const dispatchHydration = useCallback(
    (conversationId: string, snapshot: ConversationSnapshot) => {
      const listeners = listenersRef.current.get(conversationId);
      if (!listeners?.size) {
        return;
      }

      if (snapshot.conversation) {
        listeners.forEach((listener) => {
          try {
            listener({
              type: "conversation",
              conversation: snapshot.conversation!,
            });
          } catch (error) {
            console.error("Peer listener failed", error);
          }
        });
      }

      if (snapshot.messages.length) {
        listeners.forEach((listener) => {
          try {
            listener({
              type: "history",
              mode: "replace",
              messages: snapshot.messages,
              nextCursor: snapshot.nextCursor,
            });
          } catch (error) {
            console.error("Peer listener failed", error);
          }
        });
      }
    },
    [],
  );

  const ensureStorage = useCallback(() => {
    if (storagePromiseRef.current) {
      return storagePromiseRef.current;
    }

    if (typeof window === "undefined") {
      return null;
    }

    storagePromiseRef.current = getConversationStorage();
    return storagePromiseRef.current;
  }, []);

  const readStored = useCallback(
    (conversationId: string): ConversationSnapshot => {
      if (!conversationId) {
        return fallbackConversation;
      }

      const cache = cacheRef.current;
      if (cache.has(conversationId)) {
        return cache.get(conversationId)!;
      }

      const placeholder: ConversationSnapshot = { ...fallbackConversation };
      cache.set(conversationId, placeholder);

      const storagePromise = ensureStorage();
      if (storagePromise) {
        storagePromise
          .then((storage) => storage?.read(conversationId))
          .then((snapshot) => {
            if (!snapshot) {
              return;
            }
            cacheRef.current.set(conversationId, snapshot);
            dispatchHydration(conversationId, snapshot);
          })
          .catch((error) => {
            console.error("Failed to hydrate conversation from storage", error);
          });
      }

      return placeholder;
    },
    [dispatchHydration, ensureStorage],
  );

  const writeStored = useCallback(
    (conversationId: string, value: ConversationSnapshot) => {
      if (!conversationId) {
        return;
      }
      cacheRef.current.set(conversationId, value);
      const storagePromise = ensureStorage();
      if (storagePromise) {
        storagePromise
          .then((storage) => storage?.write(conversationId, value))
          .catch((error) => {
            console.error("Failed to persist chat history", error);
          });
      }
    },
    [ensureStorage],
  );

  const readStoredAsync = useCallback(
    async (conversationId: string): Promise<ConversationSnapshot> => {
      const cached = readStored(conversationId);
      if (!conversationId) {
        return cached;
      }

      if (cached.updatedAt > 0 || cached.messages.length) {
        return cached;
      }

      const storagePromise = ensureStorage();
      if (!storagePromise) {
        return cached;
      }

      try {
        const storage = await storagePromise;
        if (!storage) {
          return cached;
        }
        const snapshot = await storage.read(conversationId);
        if (snapshot) {
          cacheRef.current.set(conversationId, snapshot);
          dispatchHydration(conversationId, snapshot);
          return snapshot;
        }
      } catch (error) {
        console.error("Failed to read conversation from storage", error);
      }

      return cacheRef.current.get(conversationId) ?? fallbackConversation;
    },
    [dispatchHydration, ensureStorage, readStored],
  );

  const updateMessages = useCallback(
    (
      conversationId: string,
      incoming: ChatMessage[],
    ): ConversationSnapshot => {
      const stored = readStored(conversationId);
      if (!incoming.length) {
        return stored;
      }
      const merged = mergeMessages(stored.messages, incoming);
      const next = {
        conversation: stored.conversation,
        messages: merged,
        nextCursor: stored.nextCursor,
        updatedAt: Date.now(),
      } satisfies ConversationSnapshot;
      writeStored(conversationId, next);
      return next;
    },
    [readStored, writeStored],
  );

  const updateCursor = useCallback(
    (
      conversationId: string,
      nextCursor: string | null,
    ): ConversationSnapshot => {
      const stored = readStored(conversationId);
      if (stored.nextCursor === nextCursor) {
        return stored;
      }
      const next = {
        conversation: stored.conversation,
        messages: stored.messages,
        nextCursor,
        updatedAt: Date.now(),
      } satisfies ConversationSnapshot;
      writeStored(conversationId, next);
      return next;
    },
    [readStored, writeStored],
  );

  const updateConversation = useCallback(
    (
      conversationId: string,
      conversation: ChatConversation | null,
    ): ConversationSnapshot => {
      const stored = readStored(conversationId);
      const next = {
        conversation,
        messages: stored.messages,
        nextCursor: stored.nextCursor,
        updatedAt: Date.now(),
      } satisfies ConversationSnapshot;
      writeStored(conversationId, next);
      return next;
    },
    [readStored, writeStored],
  );

  const notify = useCallback(
    (conversationId: string, event: ChannelEvent) => {
      const listeners = listenersRef.current.get(conversationId);
      if (!listeners) return;
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error("Peer listener failed", error);
        }
      });
    },
    [],
  );

  const resolveLocale = useCallback(() => {
    if (typeof document === "undefined") {
      return "en";
    }
    const node = document.documentElement;
    const attr = node?.getAttribute("lang");
    if (attr && attr.trim()) {
      return attr.trim();
    }
    const fallback = typeof navigator !== "undefined" ? navigator.language : "en";
    return fallback?.split?.("-")?.[0] ?? "en";
  }, []);

  const formatProfileName = useCallback((profile: { firstName: string | null; lastName: string | null; email: string | null; id: string }) => {
    const first = profile.firstName?.trim();
    const last = profile.lastName?.trim();
    const combined = [first, last].filter(Boolean).join(" ");
    if (combined) {
      return combined;
    }
    if (profile.email?.trim()) {
      return profile.email;
    }
    return profile.id;
  }, []);

  const computeConversationTitle = useCallback(
    (snapshot: ConversationSnapshot, message: ChatMessage) => {
      const conversation = snapshot.conversation;
      if (!conversation) {
        return formatProfileName(message.sender);
      }

      const participantNames = conversation.participants
        .map((participant) => formatProfileName(participant.user))
        .filter((value, index, array) => array.indexOf(value) === index);

      if (participantNames.length === 0) {
        return formatProfileName(message.sender);
      }

      if (participantNames.length === 1) {
        return participantNames[0];
      }

      const [first, second] = participantNames;
      if (participantNames.length === 2) {
        return `${first} • ${second}`;
      }

      return `${first}, ${second} +${participantNames.length - 2}`;
    },
    [formatProfileName],
  );

  const publishServiceWorkerEvent = useCallback(
    async (conversationId: string, snapshot: ConversationSnapshot, message: ChatMessage, clientMessageId?: string | null) => {
      const locale = resolveLocale();
      const isClientVisible =
        typeof document !== "undefined" ? document.visibilityState === "visible" : false;

      const payload = {
        type: "peer:message",
        conversationId,
        message,
        messageId: message.id,
        clientMessageId: clientMessageId ?? null,
        senderName: formatProfileName(message.sender),
        body: message.body,
        receivedAt: Date.now(),
        locale,
        url: `/${locale}/app/chat`,
        conversationTitle: computeConversationTitle(snapshot, message),
        isClientVisible,
      } satisfies Record<string, unknown>;

      await postServiceWorkerMessage(payload).catch(() => undefined);
    },
    [computeConversationTitle, formatProfileName, resolveLocale],
  );

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.serviceWorker) {
      return;
    }

    const handleMessage = (event: MessageEvent) => {
      const payload = event.data;
      if (!payload || typeof payload !== "object") {
        return;
      }

      if (payload.type === "peer:queued-messages") {
        const records = Array.isArray(payload.messages) ? payload.messages : [];
        const ackIds: string[] = [];
        records.forEach((entry) => {
          if (!entry || typeof entry !== "object") {
            return;
          }
          const conversationId = typeof entry.conversationId === "string" ? entry.conversationId : null;
          const message = entry.message as ChatMessage | undefined;
          const recordId = typeof entry.id === "string" ? entry.id : null;
          if (!conversationId || !message) {
            return;
          }
          updateMessages(conversationId, [message]);
          notify(conversationId, { type: "message", message });
          if (recordId) {
            ackIds.push(recordId);
          }
        });

        if (ackIds.length) {
          void postServiceWorkerMessage({ type: "peer:ack-messages", messageIds: ackIds });
        }
      } else if (payload.type === "peer:badge-count") {
        const detail = {
          type: "peer:badge-count",
          count: Number(payload.count) || 0,
        } as const;
        window.dispatchEvent(new CustomEvent("peer-badge-count", { detail }));
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    void postServiceWorkerMessage({ type: "peer:flush" });

    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [notify, updateMessages]);
  const resolvePending = useCallback(<T,>(
    map: PendingMap<T>,
    key: string | null | undefined,
    value: T,
  ) => {
    if (!key) return false;
    const entry = map.get(key);
    if (!entry) return false;
    map.delete(key);
    entry.resolve(value);
    return true;
  }, []);

  const rejectPending = useCallback(<T,>(
    map: PendingMap<T>,
    key: string | null | undefined,
    error: Error,
  ) => {
    if (!key) return false;
    const entry = map.get(key);
    if (!entry) return false;
    map.delete(key);
    entry.reject(error);
    return true;
  }, []);

  const registerPending = useCallback(<T,>(
    map: PendingMap<T>,
    key: string,
    resolve: (value: T) => void,
    reject: (error: Error) => void,
    timeoutMs: number,
  ) => {
    let cleared = false;
    let timer: number | null = null;

    const clear = () => {
      if (cleared) return;
      cleared = true;
      if (timer) {
        clearTimeout(timer);
      }
      map.delete(key);
    };

    const entry: PendingEntry<T> = {
      resolve(value) {
        clear();
        resolve(value);
      },
      reject(error) {
        clear();
        reject(error);
      },
    };

    map.set(key, entry);

    if (typeof window !== "undefined" && timeoutMs > 0) {
      timer = window.setTimeout(() => {
        entry.reject(new Error("Timed out waiting for peer response"));
      }, timeoutMs);
    }

    return () => {
      if (!cleared) {
        map.delete(key);
      }
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  const handleFrame = useCallback(
    (frame: PeerTransportIncomingFrame | null) => {
      if (!frame) return;

      switch (frame.type) {
        case "heartbeat": {
          if (frame.kind === "ping") {
            const response: PeerHeartbeatFrame = {
              type: "heartbeat",
              kind: "pong",
              timestamp: frame.timestamp,
            };
            const transport = transportRef.current;
            if (transport) {
              transport
                .send(JSON.stringify(response))
                .catch((error) => console.error("Failed to send heartbeat ack", error));
            }
            break;
          }

          awaitingHeartbeatAckRef.current = false;
          if (heartbeatTimeoutRef.current) {
            clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          heartbeatPrimedRef.current = true;
          break;
        }
        case "message": {
          const { conversationId, message, clientMessageId } = frame;
          const updatedSnapshot = updateMessages(conversationId, [message]);
          notify(conversationId, { type: "message", message, clientMessageId });
          void publishServiceWorkerEvent(conversationId, updatedSnapshot, message, clientMessageId);
          break;
        }
        case "message:ack": {
          const { conversationId, message, clientMessageId, error } = frame;
          if (error) {
            const ackError = new Error(error);
            const handled = rejectPending(
              pendingAcksRef.current,
              clientMessageId,
              ackError,
            );
            if (!handled && conversationId) {
              notify(conversationId, { type: "error", error: ackError });
            }
            break;
          }

          if (!conversationId) {
            if (message) {
              resolvePending(
                pendingAcksRef.current,
                clientMessageId,
                message,
              );
            }
            break;
          }

          if (!message) {
            const stored = readStored(conversationId);
            const resolved = stored.messages.find(
              (entry) => entry.id === clientMessageId,
            );
            if (resolved) {
              resolvePending(
                pendingAcksRef.current,
                clientMessageId,
                resolved,
              );
            } else if (clientMessageId) {
              rejectPending(
                pendingAcksRef.current,
                clientMessageId,
                new Error("Missing acknowledgment payload"),
              );
            }
            break;
          }

          const updatedSnapshot = updateMessages(conversationId, [message]);
          resolvePending(pendingAcksRef.current, clientMessageId, message);
          notify(conversationId, { type: "message", message, clientMessageId });
          void publishServiceWorkerEvent(conversationId, updatedSnapshot, message, clientMessageId);
          const deliveredAt = message.updatedAt ?? message.createdAt;
          const storedSnapshot = readStored(conversationId);
          const recipientId =
            storedSnapshot.conversation?.participants.find(
              (participant) => participant.userId !== message.senderId,
            )?.userId ?? message.senderId;
          const deliveryPresence: PeerPresenceUpdate = {
            kind: "delivery",
            conversationId,
            userId: recipientId,
            messageId: message.id,
            clientMessageId: clientMessageId ?? null,
            deliveredAt,
          };
          emitPeerPresence(deliveryPresence);
          notify(conversationId, { type: "presence", presence: deliveryPresence });
          break;
        }
        case "history:sync": {
          const conversationId = frame.conversationId;
          const conversation = frame.conversation ?? null;
          const messages = frame.messages ?? [];
          const nextCursor = frame.nextCursor ?? null;
          if (conversationId) {
            if (conversation) {
              updateConversation(conversationId, conversation);
              notify(conversationId, {
                type: "conversation",
                conversation,
              });
            }
            if (messages.length) {
              updateMessages(conversationId, messages);
            }
            updateCursor(conversationId, nextCursor);
            notify(conversationId, {
              type: "history",
              mode: "replace",
              messages,
              nextCursor,
            });
          }
          resolvePending(pendingHistoryRef.current, frame.requestId, {
            conversation,
            messages,
            nextCursor,
          });
          break;
        }
        case "history:page": {
          const conversationId = frame.conversationId;
          const messages = frame.messages ?? [];
          const nextCursor = frame.nextCursor ?? null;
          if (conversationId) {
            if (messages.length) {
              updateMessages(conversationId, messages);
            }
            updateCursor(conversationId, nextCursor);
            notify(conversationId, {
              type: "history",
              mode: "prepend",
              messages,
              nextCursor,
            });
          }
          resolvePending(pendingLoadRef.current, frame.requestId, {
            messages,
            nextCursor,
          });
          break;
        }
        case "conversation": {
          const conversation = frame.conversation;
          if (conversation?.id) {
            updateConversation(conversation.id, conversation);
            notify(conversation.id, {
              type: "conversation",
              conversation,
            });
          }
          break;
        }
        case "presence": {
          const { conversationId, presence } = frame;
          emitPeerPresence(presence);
          notify(conversationId, { type: "presence", presence });
          break;
        }
        case "typing": {
          const { conversationId, typing } = frame;
          const presence: PeerPresenceUpdate = {
            kind: "typing",
            conversationId,
            typing,
          };
          emitPeerPresence(presence);
          notify(conversationId, { type: "presence", presence });
          break;
        }
        case "error": {
          const error = new Error(frame.message ?? "Peer channel error");
          if (
            !rejectPending(pendingHistoryRef.current, frame.requestId, error)
          ) {
            rejectPending(pendingLoadRef.current, frame.requestId, error);
          }
          if (frame.conversationId) {
            notify(frame.conversationId, { type: "error", error });
          }
          break;
        }
        default: {
          break;
        }
      }
    },
    [
      notify,
      publishServiceWorkerEvent,
      readStored,
      rejectPending,
      resolvePending,
      updateConversation,
      updateCursor,
      updateMessages,
    ],
  );

  const { transport: transportOption, onHeartbeatTimeout, directOnly } = options;

  useEffect(() => {
    transportRef.current = options.transport;
    if (!options.transport) {
      rejectAllPending(new Error("Peer transport is unavailable"));
      awaitingHeartbeatAckRef.current = false;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
      return undefined;
    }

    const unsubscribe = options.transport.onMessage((payload) => {
      handleFrame(parseTransportMessage(payload));
    });
    const unsubscribeError = options.transport.onError((error) => {
      console.error("Peer transport error", error);
    });

    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [handleFrame, options.transport, rejectAllPending]);

  useEffect(() => {
    const transport = options.transport;
    if (!transport) {
      return () => undefined;
    }
    const unsubscribe = transport.onStateChange((state) => {
      if (
        state === "error" ||
        state === "closed" ||
        state === "recovering" ||
        state === "degraded"
      ) {
        rejectAllPending(
          new Error("Peer transport disconnected before peer responded"),
        );
      }
    });
    return () => {
      unsubscribe();
    };
  }, [options.transport, rejectAllPending]);

  useEffect(() => {
    const transport = transportRef.current;
    awaitingHeartbeatAckRef.current = false;
    heartbeatReadyRef.current = false;
    heartbeatPrimedRef.current = false;

    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    if (heartbeatTimeoutRef.current) {
      clearTimeout(heartbeatTimeoutRef.current);
      heartbeatTimeoutRef.current = null;
    }

    if (!transport) {
      return () => undefined;
    }

    let cancelled = false;

    const clearHeartbeatTimeout = () => {
      if (heartbeatTimeoutRef.current) {
        clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    };

    const scheduleTimeout = () => {
      clearHeartbeatTimeout();
      heartbeatTimeoutRef.current = setTimeout(async () => {
        awaitingHeartbeatAckRef.current = false;
        if (heartbeatRecoveryRef.current) {
          return;
        }
        heartbeatRecoveryRef.current = true;
        try {
          await onHeartbeatTimeout?.();
        } catch (error) {
          console.error("Heartbeat recovery failed", error);
        } finally {
          heartbeatRecoveryRef.current = false;
        }
      }, HEARTBEAT_TIMEOUT_MS);
    };

    const sendHeartbeat = async () => {
      const handle = transportRef.current;
      if (!handle || cancelled || !heartbeatReadyRef.current) {
        return;
      }

      const state = handle.state;
      if (state !== "connected") {
        awaitingHeartbeatAckRef.current = false;
        return;
      }

      try {
        awaitingHeartbeatAckRef.current = true;
        const payload: PeerHeartbeatFrame = {
          type: "heartbeat",
          kind: "ping",
          timestamp: Date.now(),
        };
        await handle.send(JSON.stringify(payload));
        scheduleTimeout();
      } catch (error) {
        awaitingHeartbeatAckRef.current = false;
        if (error instanceof Error) {
          const message = error.message.toLowerCase();
          if (
            message === "transport is not connected" ||
            message.includes("data channel is not open")
          ) {
            return;
          }
        }
        console.error("Failed to send heartbeat", error);
      }
    };

    const startHeartbeat = () => {
      if (cancelled) {
        return;
      }

      heartbeatIntervalRef.current = setInterval(() => {
        if (awaitingHeartbeatAckRef.current) {
          return;
        }
        void sendHeartbeat();
      }, HEARTBEAT_INTERVAL_MS);

      void sendHeartbeat();
    };

    const abortController = new AbortController();

    void transport.ready
      .then(() => {
        if (cancelled || abortController.signal.aborted) {
          return;
        }
        heartbeatReadyRef.current = true;
        startHeartbeat();
      })
      .catch(() => undefined);

    const unsubscribeState = transport.onStateChange((state) => {
      if (
        state === "degraded" ||
        state === "recovering" ||
        state === "closed" ||
        state === "error"
      ) {
        awaitingHeartbeatAckRef.current = false;
        heartbeatPrimedRef.current = false;
        clearHeartbeatTimeout();
      }
    });

    return () => {
      cancelled = true;
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      clearHeartbeatTimeout();
      abortController.abort();
      unsubscribeState();
    };
  }, [onHeartbeatTimeout, transportOption]);

  const subscribeMessages = useCallback(
    (conversationId: string, listener: ChannelListener) => {
      if (!conversationId) {
        return () => undefined;
      }
      const listeners = listenersRef.current.get(conversationId) ?? new Set();
      listeners.add(listener);
      listenersRef.current.set(conversationId, listeners);

      // Immediately hydrate with cached data when available.
      const cached = readStored(conversationId);
      if (cached?.conversation) {
        listener({ type: "conversation", conversation: cached.conversation });
      }
      if (cached?.messages?.length) {
        listener({
          type: "history",
          mode: "replace",
          messages: cached.messages,
          nextCursor: cached.nextCursor ?? null,
        });
      }

      return () => {
        const current = listenersRef.current.get(conversationId);
        if (!current) return;
        current.delete(listener);
        if (!current.size) {
          listenersRef.current.delete(conversationId);
        }
      };
    },
    [],
  );

  const sendViaHttp = useCallback(
    async ({
      conversationId,
      body,
      clientMessageId,
    }: {
      conversationId: string;
      body: string;
      clientMessageId: string;
    }) => {
      const transport = transportRef.current;
      if (directOnly && transport?.state === "connected") {
        return false;
      }
      try {
        const response = await fetch(
          `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body, clientMessageId }),
          },
        );

        if (!response.ok) {
          throw new Error(`HTTP send failed with status ${response.status}`);
        }

        const json = (await response.json()) as { message?: ChatMessage | null };
        handleFrame({
          type: "message:ack",
          conversationId,
          clientMessageId,
          message: json.message ?? undefined,
        });
        return true;
      } catch (error) {
        return false;
      }
    },
    [directOnly, handleFrame, transportRef],
  );

  const syncViaHttp = useCallback(
    async ({ friendId, limit, signal }: SyncHistoryOptions) => {
      if (!friendId) {
        return { ...fallbackConversation } satisfies SyncHistoryResult;
      }

      const response = await fetch("/api/conversations/direct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendId, limit }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP history sync failed with status ${response.status}`);
      }

      const json = (await response.json()) as {
        conversation?: ChatConversation | null;
        messages?: ChatMessage[];
        nextCursor?: string | null;
      };

      const conversationId = json.conversation?.id ?? null;
      const messages = json.messages ?? [];
      const nextCursor = json.nextCursor ?? null;

      if (conversationId) {
        if (json.conversation) {
          updateConversation(conversationId, json.conversation);
          notify(conversationId, {
            type: "conversation",
            conversation: json.conversation,
          });
        }

        if (messages.length) {
          updateMessages(conversationId, messages);
        }

        updateCursor(conversationId, nextCursor);
        notify(conversationId, {
          type: "history",
          mode: "replace",
          messages,
          nextCursor,
        });
      }

      return {
        conversation: json.conversation ?? null,
        messages,
        nextCursor,
      } satisfies SyncHistoryResult;
    },
    [notify, updateConversation, updateCursor, updateMessages],
  );

  const flushOutboundQueue = useCallback(async () => {
    if (!outboundQueueRef.current.length) {
      return;
    }

    const entries = outboundQueueRef.current.splice(0);
    for (const entry of entries) {
      let delivered = false;
      const transport = transportRef.current;

      if (transport) {
        await transport.ready.catch(() => undefined);
        try {
          await transport.send(JSON.stringify(entry.payload));
          delivered = true;
        } catch (error) {
        }
      }

      if (!delivered) {
        delivered = await sendViaHttp(entry.payload);
      }

      if (!delivered) {
        outboundQueueRef.current.push(entry);
      }
    }
  }, [sendViaHttp]);

  useEffect(() => {
    void flushOutboundQueue();
  }, [flushOutboundQueue, options.transport]);

  const sendMessage = useCallback(
    async ({
      conversationId,
      body,
      clientMessageId,
      optimisticMessage,
    }: SendMessageOptions) => {
      if (!conversationId) {
        throw new Error("Conversation is not ready");
      }

      const transport = transportRef.current;
      if (!transport) {
        updateMessages(conversationId, [optimisticMessage]);
        notify(conversationId, {
          type: "message",
          message: optimisticMessage,
          clientMessageId,
        });
      }

      const payload = {
        type: "message:send",
        conversationId,
        body,
        clientMessageId,
      };

      return new Promise<SendMessageResult>((resolve, reject) => {
        registerPending(
          pendingAcksRef.current,
          clientMessageId,
          (message) => resolve({ message }),
          (error) => reject(error),
          ACK_TIMEOUT_MS,
        );

        const attemptSend = async () => {
          const handle = transportRef.current;
          if (handle) {
            await handle.ready.catch(() => undefined);
            try {
              await handle.send(JSON.stringify(payload));
              return;
            } catch (error) {
              rejectPending(
                pendingAcksRef.current,
                clientMessageId,
                normalizeError(error),
              );
              return;
            }
          }

          const delivered = await sendViaHttp(payload);
          if (!delivered) {
            outboundQueueRef.current.push({ payload });
          }
        };

        void attemptSend().catch((error) =>
          rejectPending(pendingAcksRef.current, clientMessageId, normalizeError(error)),
        );
      });
    },
    [notify, registerPending, rejectPending, sendViaHttp, updateMessages],
  );

  const sendPresence = useCallback(
    async (presence: PeerPresenceUpdate) => {
      const conversationId = presence.conversationId;
      if (!conversationId) {
        throw new Error("Presence update is missing a conversation identifier");
      }

      const transport = transportRef.current;
      if (!transport) {
        return;
      }

      await transport.ready.catch(() => undefined);

      try {
        await transport.send(
          JSON.stringify({
            type: "presence",
            conversationId,
            presence,
          }),
        );
      } catch (error) {
        if (isTransportDisconnectedError(error)) {
          return;
        }
        console.error("Failed to send presence update", error);
      }
    },
    [readStored],
  );

  const sendPresenceTyping = useCallback(
    async ({ conversationId, typing }: SendTypingPresenceOptions) => {
      if (!conversationId) {
        return;
      }

      const payload: PeerPresenceUpdate = {
        kind: "typing",
        conversationId,
        typing,
      };

      try {
        await sendPresence(payload);
      } catch (error) {
        if (isTransportDisconnectedError(error)) {
          return;
        }
        console.error("Failed to publish typing presence", error);
      }
    },
    [sendPresence],
  );

  const sendPresenceReadReceipt = useCallback(
    async ({
      conversationId,
      userId,
      lastMessageId,
      readAt,
    }: SendReadReceiptPresenceOptions) => {
      if (!conversationId) {
        return;
      }

      const payload: PeerPresenceUpdate = {
        kind: "read",
        conversationId,
        userId,
        lastMessageId,
        readAt: readAt ?? new Date().toISOString(),
      };

      try {
        await sendPresence(payload);
      } catch (error) {
        if (isTransportDisconnectedError(error)) {
          return;
        }
        console.error("Failed to publish read receipt", error);
      }
    },
    [sendPresence],
  );

  const sendPresenceDeliveryAck = useCallback(
    async ({
      conversationId,
      userId,
      messageId,
      clientMessageId,
      deliveredAt,
    }: SendDeliveryPresenceOptions) => {
      if (!conversationId) {
        return;
      }

      const payload: PeerPresenceUpdate = {
        kind: "delivery",
        conversationId,
        userId,
        messageId,
        clientMessageId: clientMessageId ?? null,
        deliveredAt: deliveredAt ?? new Date().toISOString(),
      };

      try {
        await sendPresence(payload);
      } catch (error) {
        if (isTransportDisconnectedError(error)) {
          return;
        }
        console.error("Failed to publish delivery acknowledgment", error);
      }
    },
    [sendPresence],
  );

  const loadMore = useCallback(
    async ({ conversationId, cursor, limit, signal }: LoadMoreOptions) => {
      if (!conversationId) {
        throw new Error("Conversation is not ready");
      }

      const transport = transportRef.current;
      if (!transport) {
        const cached = await readStoredAsync(conversationId);
        return {
          messages: cached.messages,
          nextCursor: cached.nextCursor,
        } satisfies LoadMoreResult;
      }

      await transport.ready.catch(() => undefined);
      const requestId = createRequestId();
      const payload = {
        type: "history:page",
        conversationId,
        cursor,
        limit,
        requestId,
      };

      return new Promise<LoadMoreResult>((resolve, reject) => {
        const cleanup = registerPending(
          pendingLoadRef.current,
          requestId,
          (result) => resolve(result),
          (error) => reject(error),
          HISTORY_TIMEOUT_MS,
        );

        const abortHandler = () => {
          cleanup();
          reject(new Error("History request aborted"));
        };

        if (signal) {
          if (signal.aborted) {
            abortHandler();
            return;
          }
          signal.addEventListener("abort", abortHandler, { once: true });
        }

        transport
          .send(JSON.stringify(payload))
          .catch((error) => {
            cleanup();
            reject(normalizeError(error));
          });
      });
    },
    [readStoredAsync, registerPending],
  );

  const syncHistory = useCallback(
    async ({
      friendId,
      limit,
      signal,
      initialConversation,
      initialMessages,
      initialCursor,
      conversationIdHint,
    }: SyncHistoryOptions): Promise<SyncHistoryResult> => {
      let hydratedConversationId: string | null = null;

      if (initialConversation?.id) {
        hydratedConversationId = initialConversation.id;
        updateConversation(hydratedConversationId, initialConversation);
        if (initialMessages?.length) {
          updateMessages(hydratedConversationId, initialMessages);
        }
        updateCursor(hydratedConversationId, initialCursor ?? null);
        notify(hydratedConversationId, {
          type: "conversation",
          conversation: initialConversation,
        });
        notify(hydratedConversationId, {
          type: "history",
          mode: "replace",
          messages: initialMessages ?? [],
          nextCursor: initialCursor ?? null,
        });
      }

      const candidateConversationId = conversationIdHint ?? hydratedConversationId ?? null;

      const transport = transportRef.current;
      if (!transport) {
        if (candidateConversationId) {
          const cached = await readStoredAsync(candidateConversationId);
          if (cached.conversation || cached.messages.length) {
            return {
              conversation: cached.conversation,
              messages: cached.messages,
              nextCursor: cached.nextCursor,
            } satisfies SyncHistoryResult;
          }
        }
        return syncViaHttp({ friendId, limit, signal });
      }

      await transport.ready.catch(() => undefined);
      const requestId = createRequestId();
      const payload = {
        type: "history:sync",
        friendId,
        limit,
        conversationId: candidateConversationId,
        requestId,
      };

      const attemptPeerSync = () =>
        new Promise<SyncHistoryResult>((resolve, reject) => {
          const cleanup = registerPending(
            pendingHistoryRef.current,
            requestId,
            (result) => resolve(result),
            (error) => reject(error),
            HISTORY_TIMEOUT_MS,
          );

          const abortHandler = () => {
            cleanup();
            reject(new Error("History sync aborted"));
          };

          if (signal) {
            if (signal.aborted) {
              abortHandler();
              return;
            }
            signal.addEventListener("abort", abortHandler, { once: true });
          }

          transport
            .send(JSON.stringify(payload))
            .catch((error) => {
              cleanup();
              reject(normalizeError(error));
            });
        });

      try {
        return await attemptPeerSync();
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          throw error;
        }

        if (isTransportDisconnectedError(error)) {
          return syncViaHttp({ friendId, limit, signal });
        }

        try {
          return await syncViaHttp({ friendId, limit, signal });
        } catch (fallbackError) {
          throw fallbackError instanceof Error
            ? fallbackError
            : normalizeError(fallbackError);
        }
      }
    },
    [
      notify,
      readStoredAsync,
      registerPending,
      syncViaHttp,
      updateConversation,
      updateCursor,
      updateMessages,
    ],
  );

  return useMemo(
    () => ({
      sendMessage,
      subscribeMessages,
      loadMore,
      syncHistory,
      presence: {
        sendTyping: sendPresenceTyping,
        sendReadReceipt: sendPresenceReadReceipt,
        sendDeliveryAck: sendPresenceDeliveryAck,
      },
    }),
    [
      loadMore,
      sendMessage,
      sendPresenceDeliveryAck,
      sendPresenceReadReceipt,
      sendPresenceTyping,
      subscribeMessages,
      syncHistory,
    ],
  );
}
