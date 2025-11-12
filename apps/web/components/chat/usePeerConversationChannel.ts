"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  type TransportHandle,
  type TransportMessage,
} from "@/lib/messaging-transport";

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
const ACK_TIMEOUT_MS = 7_000;
const HISTORY_TIMEOUT_MS = 10_000;

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
  | { type: "typing"; typing: TypingEvent }
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

type PeerFrame =
  | {
      type: "message";
      conversationId: string;
      message: ChatMessage;
      clientMessageId?: string | null;
    }
  | {
      type: "message:ack";
      conversationId: string;
      message?: ChatMessage;
      clientMessageId?: string | null;
      error?: string;
    }
  | {
      type: "history:sync";
      conversationId: string;
      messages: ChatMessage[];
      nextCursor?: string | null;
      conversation?: ChatConversation | null;
      requestId?: string;
    }
  | {
      type: "history:page";
      conversationId: string;
      messages: ChatMessage[];
      nextCursor?: string | null;
      requestId?: string;
    }
  | {
      type: "conversation";
      conversation: ChatConversation;
    }
  | {
      type: "typing";
      conversationId: string;
      typing: TypingEvent;
    }
  | {
      type: "error";
      requestId?: string;
      conversationId?: string;
      message?: string;
    };

type PendingMap<T> = Map<string, PendingEntry<T>>;

const fallbackConversation: ConversationSnapshot = {
  conversation: null,
  messages: [],
  nextCursor: null,
  updatedAt: 0,
};

const parseTransportMessage = (payload: TransportMessage): PeerFrame | null => {
  try {
    if (typeof payload === "string") {
      return JSON.parse(payload) as PeerFrame;
    }

    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      const view = payload instanceof ArrayBuffer
        ? new Uint8Array(payload)
        : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
      const text = new TextDecoder().decode(view);
      return JSON.parse(text) as PeerFrame;
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

export function usePeerConversationChannel(options: {
  transport: TransportHandle | null;
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
    (frame: PeerFrame | null) => {
      if (!frame) return;

      switch (frame.type) {
        case "message": {
          const { conversationId, message, clientMessageId } = frame;
          updateMessages(conversationId, [message]);
          notify(conversationId, { type: "message", message, clientMessageId });
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

          updateMessages(conversationId, [message]);
          resolvePending(pendingAcksRef.current, clientMessageId, message);
          notify(conversationId, { type: "message", message, clientMessageId });
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
        case "typing": {
          const { conversationId, typing } = frame;
          notify(conversationId, { type: "typing", typing });
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
      readStored,
      rejectPending,
      resolvePending,
      updateConversation,
      updateCursor,
      updateMessages,
    ],
  );

  useEffect(() => {
    transportRef.current = options.transport;
    if (!options.transport) {
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
  }, [handleFrame, options.transport]);

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
        return { message: optimisticMessage } satisfies SendMessageResult;
      }

      await transport.ready.catch(() => undefined);

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

        transport
          .send(JSON.stringify(payload))
          .catch((error) => {
            rejectPending(
              pendingAcksRef.current,
              clientMessageId,
              normalizeError(error),
            );
          });
      });
    },
    [notify, registerPending, rejectPending, updateMessages],
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
      if (initialConversation?.id) {
        const conversationId = initialConversation.id;
        updateConversation(conversationId, initialConversation);
        if (initialMessages?.length) {
          updateMessages(conversationId, initialMessages);
        }
        updateCursor(conversationId, initialCursor ?? null);
        notify(conversationId, {
          type: "conversation",
          conversation: initialConversation,
        });
        notify(conversationId, {
          type: "history",
          mode: "replace",
          messages: initialMessages ?? [],
          nextCursor: initialCursor ?? null,
        });
        return {
          conversation: initialConversation,
          messages: initialMessages ?? [],
          nextCursor: initialCursor ?? null,
        };
      }

      const candidateConversationId = conversationIdHint ?? null;

      const transport = transportRef.current;
      if (!transport) {
        if (candidateConversationId) {
          const cached = await readStoredAsync(candidateConversationId);
          return {
            conversation: cached.conversation,
            messages: cached.messages,
            nextCursor: cached.nextCursor,
          } satisfies SyncHistoryResult;
        }
        return { ...fallbackConversation } satisfies SyncHistoryResult;
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

      return new Promise<SyncHistoryResult>((resolve, reject) => {
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
    },
    [
      notify,
      readStored,
      readStoredAsync,
      registerPending,
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
    }),
    [loadMore, sendMessage, subscribeMessages, syncHistory],
  );
}
