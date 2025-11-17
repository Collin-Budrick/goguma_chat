"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";

import type { FriendSummary } from "@/components/contacts/types";
import {
  friendToContactProfile,
  getContactName,
  getInitials,
} from "@/components/contacts/types";
import { PreferenceToggle } from "@/components/ui/preference-toggle";
import { cn } from "@/lib/utils";
import {
  type DisplaySettings,
  DEFAULT_DISPLAY_SETTINGS,
  DISPLAY_SETTINGS_EVENT,
  loadDisplaySettings,
  persistDisplaySettings,
} from "@/lib/display-settings";
import {
  type ChatHistoryEventDetail,
  CHAT_HISTORY_EVENT,
  getConversationClearedAt,
  persistConversationClearedAt,
  removeConversationClear,
} from "@/lib/chat-history";
import { postServiceWorkerMessage } from "@/lib/service-worker-messaging";

import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from "./types";
import { mergeMessages, toDate } from "./message-utils";
import { usePeerConversationChannel } from "./usePeerConversationChannel";
import { useMessagingTransportHandle } from "./useMessagingTransportHandle";

type ChatThreadProps = {
  viewerId: string;
  viewerProfile: ChatUserProfile;
  friend: FriendSummary | null;
  initialFriendId: string | null;
  initialConversation: ChatConversation | null;
  initialMessages: ChatMessage[];
  initialCursor: string | null;
};

const MESSAGE_LIMIT = 30;
const TYPING_DEBOUNCE_MS = 2_000;

function generateClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }
  return `client-${Math.random().toString(36).slice(2)}`;
}

function formatMessageTime(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(toDate(value));
  } catch {
    return value;
  }
}
function createOptimisticMessage(
  conversationId: string,
  viewerId: string,
  viewerProfile: ChatUserProfile,
  body: string,
  id: string,
): ChatMessage {
  const timestamp = new Date().toISOString();
  return {
    id,
    conversationId,
    senderId: viewerId,
    body,
    createdAt: timestamp,
    updatedAt: timestamp,
    sender: viewerProfile,
  };
}

function getParticipantProfile(
  conversation: ChatConversation | null,
  userId: string,
): ChatUserProfile | null {
  if (!conversation) return null;
  return (
    conversation.participants.find((participant) => participant.userId === userId)
      ?.user ?? null
  );
}

export default function ChatThread({
  viewerId,
  viewerProfile,
  friend,
  initialFriendId,
  initialConversation,
  initialMessages,
  initialCursor,
}: ChatThreadProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();

  const friendId = friend?.friendId ?? null;
  const friendContact = useMemo(
    () => (friend ? friendToContactProfile(friend) : null),
    [friend],
  );

  const shouldUseInitialData = Boolean(
    friendId &&
      initialFriendId &&
      friendId === initialFriendId &&
      initialConversation,
  );

  const [conversation, setConversation] = useState<ChatConversation | null>(
    shouldUseInitialData ? initialConversation : null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(
    shouldUseInitialData ? initialMessages : [],
  );
  const [nextCursor, setNextCursor] = useState<string | null>(
    shouldUseInitialData ? initialCursor ?? null : null,
  );
  const [isThreadLoading, setIsThreadLoading] = useState(
    Boolean(friendId) && !shouldUseInitialData,
  );
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [typingState, setTypingState] = useState<Record<string, number>>({});
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(
    () => DEFAULT_DISPLAY_SETTINGS,
  );
  const [isTransportEnabled, setIsTransportEnabled] = useState(false);
  const [clearedHistoryAt, setClearedHistoryAt] = useState<string | null>(null);
  const [isSyncingHistory, setIsSyncingHistory] = useState(false);
  const [presenceToast, setPresenceToast] = useState<string | null>(null);

  const conversationId = conversation?.id ?? null;
  const { transport } = useMessagingTransportHandle({
    conversationId,
    viewerId,
    enabled: isTransportEnabled,
    peerId: friendId,
  });

  const {
    sendMessage: sendPeerMessage,
    subscribeMessages,
    loadMore,
    syncHistory,
    presence,
  } = usePeerConversationChannel({
    transport,
    directOnly: true,
  });

  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const pendingThreadControllerRef = useRef<AbortController | null>(null);
  const initialHydratedRef = useRef(shouldUseInitialData);
  const previousBootstrapKeyRef = useRef<string | null>(
    shouldUseInitialData
      ? `${initialFriendId ?? ""}:${initialConversation?.id ?? ""}`
      : null,
  );
  const lastConversationReadKeyRef = useRef<string | null>(null);
  const settingsPanelRef = useRef<HTMLDivElement | null>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);

  const playPresenceChime = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextCtor) {
      return;
    }

    try {
      const context = new AudioContextCtor();
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      gain.gain.value = 0.08;
      oscillator.frequency.value = 880;
      oscillator.type = "sine";
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.12);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch (error) {
          console.error("Failed to clean up presence audio", error);
        }
        context.close().catch(() => undefined);
      };
    } catch (error) {
      console.error("Failed to play presence chime", error);
    }
  }, []);

  const updateDisplaySettings = useCallback(
    (updater: (prev: DisplaySettings) => DisplaySettings) => {
      setDisplaySettings((prev) => {
        const next = updater(prev);

        if (
          next.magnify === prev.magnify &&
          next.showLabels === prev.showLabels &&
          next.theme === prev.theme
        ) {
          return prev;
        }

        persistDisplaySettings(next);
        return next;
      });
    },
    [],
  );

  useEffect(() => {
    return () => {
      pendingThreadControllerRef.current?.abort();
    };
  }, []);

  const bootstrapKey = shouldUseInitialData
    ? `${initialFriendId ?? ""}:${initialConversation?.id ?? ""}`
    : null;

  useEffect(() => {
    if (bootstrapKey !== previousBootstrapKeyRef.current) {
      initialHydratedRef.current = Boolean(bootstrapKey);
      previousBootstrapKeyRef.current = bootstrapKey;
    }
  }, [bootstrapKey]);

  useEffect(() => {
    if (!conversation?.id) {
      lastConversationReadKeyRef.current = null;
    }
  }, [conversation?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.dispatchEvent(
      new CustomEvent("dock:active-conversation", {
        detail: { conversationId: conversation?.id ?? null },
      }),
    );
  }, [conversation?.id]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const stored = loadDisplaySettings();
    setDisplaySettings(stored);

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DisplaySettings>).detail;
      setDisplaySettings((prev) =>
        prev.magnify === detail.magnify &&
        prev.showLabels === detail.showLabels &&
        prev.theme === detail.theme
          ? prev
          : detail,
      );
    };

    window.addEventListener(
      DISPLAY_SETTINGS_EVENT,
      handler as EventListener,
    );

    return () => {
      window.removeEventListener(
        DISPLAY_SETTINGS_EVENT,
        handler as EventListener,
      );
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleHistoryChange = (event: Event) => {
      const detail = (event as CustomEvent<ChatHistoryEventDetail>).detail;
      if (!detail || !conversation?.id) {
        return;
      }

      if (detail.conversationId !== conversation.id) {
        return;
      }

      setClearedHistoryAt(detail.clearedAt);
    };

    window.addEventListener(
      CHAT_HISTORY_EVENT,
      handleHistoryChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        CHAT_HISTORY_EVENT,
        handleHistoryChange as EventListener,
      );
    };
  }, [conversation?.id]);

  useEffect(() => {
    if (!isSettingsOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        target &&
        !settingsPanelRef.current?.contains(target) &&
        !settingsTriggerRef.current?.contains(target)
      ) {
        setIsSettingsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsSettingsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSettingsOpen]);

  useEffect(() => {
    setIsSettingsOpen(false);
  }, [friendId]);

  useEffect(() => {
    setIsTransportEnabled(Boolean(friendId));
  }, [friendId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    return () => {
      window.dispatchEvent(
        new CustomEvent("dock:active-conversation", {
          detail: { conversationId: null },
        }),
      );
    };
  }, []);

  useEffect(() => {
    if (shouldUseInitialData) {
      setConversation(initialConversation);
      setMessages(initialMessages);
      setNextCursor(initialCursor ?? null);
    }
  }, [
    shouldUseInitialData,
    initialConversation,
    initialMessages,
    initialCursor,
  ]);

  useEffect(() => {
    if (!conversation?.id) {
      setClearedHistoryAt(null);
      return;
    }

    setClearedHistoryAt(getConversationClearedAt(conversation.id));
  }, [conversation?.id]);

  useEffect(() => {
    pendingThreadControllerRef.current?.abort();

    if (!friendId) {
      setConversation(null);
      setMessages([]);
      setNextCursor(null);
      setThreadError(null);
      setSendError(null);
      setDraft("");
      setTypingState({});
      setIsThreadLoading(false);
      return;
    }

    if (shouldUseInitialData && initialHydratedRef.current) {
      initialHydratedRef.current = false;
      setThreadError(null);
      setSendError(null);
      setDraft("");
      setTypingState({});
      setIsThreadLoading(false);
      return;
    }

    const controller = new AbortController();
    pendingThreadControllerRef.current = controller;

    const hydrateWithInitial = shouldUseInitialData && initialHydratedRef.current;

    if (hydrateWithInitial && initialConversation?.id) {
      initialHydratedRef.current = false;
      setThreadError(null);
      setSendError(null);
      setDraft("");
      setTypingState({});
      setIsThreadLoading(false);
      void syncHistory({
        friendId,
        limit: MESSAGE_LIMIT,
        signal: controller.signal,
        initialConversation,
        initialMessages,
        initialCursor: initialCursor ?? null,
      });

      return () => {
        controller.abort();
      };
    }

    setConversation(null);
    setMessages([]);
    setNextCursor(null);
    setThreadError(null);
    setSendError(null);
    setDraft("");
    setTypingState({});
    setIsThreadLoading(true);

    syncHistory({
      friendId,
      limit: MESSAGE_LIMIT,
      signal: controller.signal,
    })
      .then((result) => {
        if (controller.signal.aborted) {
          return;
        }
        setConversation(result.conversation);
        setMessages(result.messages);
        setNextCursor(result.nextCursor ?? null);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to load conversation", error);
        setConversation(null);
        setMessages([]);
        setNextCursor(null);
        setThreadError(t("alerts.history"));
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsThreadLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [
    friendId,
    shouldUseInitialData,
    initialConversation,
    initialMessages,
    initialCursor,
    syncHistory,
    t,
  ]);

  const lastMessageId =
    messages.length > 0 ? messages[messages.length - 1]?.id ?? null : null;

  useEffect(() => {
    if (!conversation?.id) {
      return;
    }

    const syncKey = `${conversation.id}:${lastMessageId ?? "none"}`;

    if (lastConversationReadKeyRef.current === syncKey) {
      return;
    }

    lastConversationReadKeyRef.current = syncKey;

    const controller = new AbortController();
    const body = lastMessageId ? JSON.stringify({ lastMessageId }) : "{}";

    const run = async () => {
      try {
        void presence.sendReadReceipt({
          conversationId: conversation.id,
          userId: viewerId,
          lastMessageId,
        });
        await fetch(`/api/conversations/${conversation.id}/read`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          signal: controller.signal,
        });
        if (!controller.signal.aborted && typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("dock:refresh-indicators", {
              detail: { scope: "chat", conversationId: conversation.id },
            }),
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to mark conversation as read", error);
        lastConversationReadKeyRef.current = null;
      }
    };

    void run();

    return () => controller.abort();
  }, [conversation?.id, lastMessageId, presence, viewerId]);

  useEffect(() => {
    if (!conversation?.id) {
      setTypingState({});
      return;
    }

    typingActiveRef.current = false;
    if (typingTimeoutRef.current) {
      window.clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }

    const unsubscribe = subscribeMessages(conversation.id, (event) => {
      if (event.type === "message") {
        const { message, clientMessageId } = event;
        setMessages((prev) => {
          const withoutClient = clientMessageId
            ? prev.filter((item) => item.id !== clientMessageId)
            : prev.filter((item) => {
                const isSameSender = item.senderId === message.senderId;
                const isSameBody = item.body === message.body;
                const createdAtDelta =
                  Math.abs(toDate(item.createdAt).getTime() -
                    toDate(message.createdAt).getTime());
                const isNearSameTimestamp = createdAtDelta < 5_000;

                return !(isSameSender && isSameBody && isNearSameTimestamp);
              });
          return mergeMessages(withoutClient, [message]);
        });
        setConversation((prev) =>
          prev ? { ...prev, updatedAt: message.createdAt } : prev,
        );
        setThreadError(null);
        return;
      }

      if (event.type === "history") {
        if (event.mode === "replace") {
          setMessages(event.messages);
        } else {
          setMessages((prev) => mergeMessages(event.messages, prev));
        }
        setNextCursor(event.nextCursor ?? null);
        setThreadError(null);
        return;
      }

      if (event.type === "conversation") {
        const nextConversation = event.conversation;
        setConversation(nextConversation);
        return;
      }

      if (event.type === "presence") {
        if (event.presence.kind === "typing") {
          const { typing } = event.presence;
          setTypingState((prev) => {
            if (!typing.isTyping) {
              if (!prev[typing.userId]) {
                return prev;
              }
              const next = { ...prev };
              delete next[typing.userId];
              return next;
            }
            return {
              ...prev,
              [typing.userId]: toDate(typing.expiresAt).getTime(),
            };
          });
          return;
        }

        if (event.presence.kind === "read") {
          if (event.presence.userId !== viewerId) {
            const profile = getParticipantProfile(conversation, event.presence.userId);
            const name = profile ? getContactName(profile) : t("thread.presence.readFallback");
            setPresenceToast(
              t("thread.presence.readToast", {
                name,
              }),
            );
            playPresenceChime();
            if (typeof window !== "undefined") {
              window.dispatchEvent(
                new CustomEvent("dock:refresh-indicators", {
                  detail: {
                    scope: "chat",
                    conversationId: conversation.id,
                  },
                }),
              );
            }
          }
          return;
        }

        if (event.presence.kind === "delivery") {
          if (event.presence.userId !== viewerId) {
            const profile = getParticipantProfile(conversation, event.presence.userId);
            const name = profile ? getContactName(profile) : t("thread.presence.deliveryFallback");
            setPresenceToast(
              t("thread.presence.deliveryToast", {
                name,
              }),
            );
            playPresenceChime();
          }
        }
        return;
      }

      if (event.type === "error") {
        setThreadError(event.error.message);
      }
    });

    return unsubscribe;
  }, [
    conversation,
    subscribeMessages,
    t,
    viewerId,
    playPresenceChime,
  ]);

  useEffect(() => {
    if (!conversation?.id) {
      return;
    }

    const interval = window.setInterval(() => {
      setTypingState((prev) => {
        if (!prev) {
          return prev;
        }
        const now = Date.now();
        const next: Record<string, number> = { ...prev };
        let changed = false;
        for (const [userId, expiry] of Object.entries(prev)) {
          if (expiry <= now) {
            delete next[userId];
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 1_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [conversation?.id]);

  useEffect(() => {
    if (!messageContainerRef.current) {
      return;
    }
    if (isFetchingMore) {
      return;
    }
    const node = messageContainerRef.current;
    node.scrollTop = node.scrollHeight;
  }, [conversation?.id, messages.length, isFetchingMore, clearedHistoryAt]);

  useEffect(() => {
    if (!presenceToast) {
      return;
    }

    if (typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      setPresenceToast(null);
    }, 4_000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [presenceToast]);


  const viewerParticipant = useMemo(
    () => getParticipantProfile(conversation, viewerId) ?? viewerProfile,
    [conversation, viewerId, viewerProfile],
  );

  const typingProfiles = useMemo(() => {
    if (!conversation) return [];
    const now = Date.now();
    return conversation.participants
      .map((participant) => participant.user)
      .filter(
        (profile) =>
          profile.id !== viewerId &&
          typingState[profile.id] &&
          typingState[profile.id] > now,
      );
  }, [conversation, typingState, viewerId]);

  const typingText = useMemo(() => {
    if (!typingProfiles.length) {
      return null;
    }
    const names = typingProfiles.map((profile) => getContactName(profile));
    if (names.length === 1) {
      return `${names[0]} is typing...`;
    }
    if (names.length === 2) {
      return `${names[0]} and ${names[1]} are typing...`;
    }
    return `${names[0]} and others are typing...`;
  }, [typingProfiles]);

  const clearedHistoryCutoff = clearedHistoryAt
    ? toDate(clearedHistoryAt).getTime()
    : null;

  useEffect(() => {
    if (!conversationId) {
      return;
    }
    void postServiceWorkerMessage({
      type: "peer:conversation-opened",
      conversationId,
    });
  }, [conversationId]);

  const visibleMessages = useMemo(() => {
    if (!conversationId || !clearedHistoryCutoff) {
      return messages;
    }

    return messages.filter((message) => {
      if (message.conversationId !== conversationId) {
        return true;
      }
      return toDate(message.createdAt).getTime() > clearedHistoryCutoff;
    });
  }, [clearedHistoryCutoff, conversationId, messages]);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) {
        return;
      }
      const expiresAt = new Date(Date.now() + TYPING_DEBOUNCE_MS).toISOString();
      void presence.sendTyping({
        conversationId,
        typing: {
          userId: viewerId,
          isTyping,
          expiresAt,
        },
      });
    },
    [conversationId, presence, viewerId],
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (sendError) {
        setSendError(null);
      }

      if (!conversationId) {
        return;
      }

      const trimmed = value.trim();

      if (trimmed && !typingActiveRef.current) {
        typingActiveRef.current = true;
        sendTyping(true);
      }

      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }

      if (trimmed) {
        typingTimeoutRef.current = window.setTimeout(() => {
          typingActiveRef.current = false;
          sendTyping(false);
          typingTimeoutRef.current = null;
        }, TYPING_DEBOUNCE_MS);
      } else if (typingActiveRef.current) {
        typingActiveRef.current = false;
        sendTyping(false);
      }
    },
    [conversationId, sendTyping, sendError],
  );

  const handleComposerSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!conversation || !conversationId) {
        return;
      }

      const content = draft.trim();
      if (!content) {
        return;
      }

      if (!isTransportEnabled) {
        setIsTransportEnabled(true);
      }

      const clientMessageId = generateClientMessageId();
      const optimistic = createOptimisticMessage(
        conversationId,
        viewerId,
        viewerParticipant,
        content,
        clientMessageId,
      );

      setMessages((prev) => mergeMessages(prev, [optimistic]));
      setDraft("");
      setSendError(null);
      setIsSending(true);
      typingActiveRef.current = false;
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      sendTyping(false);

      try {
        await sendPeerMessage({
          conversationId,
          body: content,
          clientMessageId,
          optimisticMessage: optimistic,
        });
      } catch (error) {
        console.error("Failed to send message", error);
        setMessages((prev) =>
          prev.filter((message) => message.id !== clientMessageId),
        );
        setDraft(content);
        setSendError(t("alerts.send"));
      } finally {
        setIsSending(false);
      }
    },
    [
      conversation,
      conversationId,
      draft,
      isTransportEnabled,
      sendPeerMessage,
      sendTyping,
      t,
      viewerId,
      viewerParticipant,
    ],
  );

  const handleLoadMore = useCallback(async () => {
    if (!conversationId || !nextCursor || isFetchingMore) {
      return;
    }

    setIsFetchingMore(true);
    setThreadError(null);

    try {
      const result = await loadMore({
        conversationId,
        cursor: nextCursor,
        limit: MESSAGE_LIMIT,
      });
      setMessages((prev) => mergeMessages(result.messages, prev));
      setNextCursor(result.nextCursor ?? null);
    } catch (error) {
      console.error("Failed to load more messages", error);
      setThreadError(t("alerts.history"));
    } finally {
      setIsFetchingMore(false);
    }
  }, [conversationId, isFetchingMore, loadMore, nextCursor, t]);

  const handleSyncHistory = useCallback(async () => {
    if (!friendId || isSyncingHistory) {
      return;
    }

    setIsSyncingHistory(true);
    setThreadError(null);

    try {
      const result = await syncHistory({
        friendId,
        limit: MESSAGE_LIMIT,
      });

      setConversation(result.conversation);
      setMessages(result.messages);
      setNextCursor(result.nextCursor ?? null);
      if (result.conversation?.id) {
        removeConversationClear(result.conversation.id);
        setClearedHistoryAt(null);
      }
    } catch (error) {
      console.error("Failed to sync chat history", error);
      setThreadError(t("thread.settings.local.options.syncHistory.error"));
    } finally {
      setIsSyncingHistory(false);
    }
  }, [friendId, isSyncingHistory, syncHistory, t]);

  const handleClearHistory = useCallback(() => {
    if (!conversationId) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      !window.confirm(
        t("thread.settings.local.options.clearHistory.confirm"),
      )
    ) {
      return;
    }

    const timestamp = persistConversationClearedAt(conversationId);
    if (timestamp) {
      setClearedHistoryAt(timestamp);
    }
  }, [conversationId, t]);

  const bubblePaddingClasses = displaySettings.magnify ? "px-5 py-4" : "px-4 py-3";
  const bubbleTextClasses = displaySettings.magnify
    ? "text-base leading-7"
    : "text-sm leading-6";
  const viewerBubbleClasses = displaySettings.theme === "light"
    ? "ml-auto border-white/40 bg-white text-black"
    : "ml-auto border-white/20 bg-black/80 text-white";
  const viewerMetaClasses = displaySettings.theme === "light" ? "text-black/50" : "text-white/50";
  const toggleTheme: "dark" | "light" =
    displaySettings.theme === "light" ? "light" : "dark";
  const isClearHistoryDisabled = !conversationId || isSyncingHistory;
  const isSyncHistoryDisabled = !friendId || isThreadLoading || isSyncingHistory;
  const syncButtonClasses = cn(
    "rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60",
    toggleTheme === "light"
      ? "border-white/40 bg-white text-slate-900 hover:border-white/70"
      : "border-white/10 bg-white/5 text-white hover:border-white/25 hover:bg-white/10",
  );
  const syncButtonLabelClasses =
    toggleTheme === "light"
      ? "text-sm font-semibold text-slate-900"
      : "text-sm font-semibold text-white";
  const syncButtonDescriptionClasses =
    toggleTheme === "light"
      ? "text-xs text-slate-600"
      : "text-xs text-white/70";
  const clearButtonClasses = cn(
    "rounded-xl border px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 disabled:cursor-not-allowed disabled:opacity-60",
    toggleTheme === "light"
      ? "border-red-200/70 bg-white/90 hover:border-red-300 hover:bg-red-50"
      : "border-red-400/60 bg-white/5 hover:border-red-300/80 hover:bg-white/10",
  );
  const clearButtonLabelClasses =
    toggleTheme === "light"
      ? "text-sm font-semibold text-slate-900"
      : "text-sm font-semibold text-white";
  const clearButtonDescriptionClasses =
    toggleTheme === "light"
      ? "text-xs text-slate-600"
      : "text-xs text-white/70";

  return (
    <section className="relative flex flex-1 flex-col rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-black/40 to-black/30 text-white">
      {friendContact ? (
        <>
          <header className="relative flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
            <Link
              href={`/${locale}/app/chat`}
              aria-label={t("thread.back")}
              className="absolute left-6 top-4 flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-lg leading-none text-white transition hover:border-white/60 hover:text-white/80"
            >
              ←
            </Link>
            <div className="flex flex-1 items-center justify-between gap-4 pl-10">
              <div className="flex items-center gap-4">
                {friendContact.image ? (
                  <img
                    src={friendContact.image}
                    alt={getContactName(friendContact)}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-base font-semibold">
                    {getInitials(friendContact)}
                  </span>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("thread.header")}
                  </p>
                  <p className="text-sm text-white">
                    {t("thread.directWith", {
                      name: getContactName(friendContact),
                    })}
                  </p>
                </div>
              </div>
              <div className="relative">
                <button
                  type="button"
                  ref={settingsTriggerRef}
                  onClick={() => setIsSettingsOpen((prev) => !prev)}
                  aria-haspopup="dialog"
                  aria-expanded={isSettingsOpen}
                  aria-label={
                    isSettingsOpen
                      ? t("thread.settings.close")
                      : t("thread.settings.open")
                  }
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/5 text-white transition hover:border-white/40 hover:bg-white/10"
                >
                  <span className="sr-only">
                    {isSettingsOpen
                      ? t("thread.settings.close")
                      : t("thread.settings.open")}
                  </span>
                  <img
                    src="/icons/gear.svg"
                    alt=""
                    aria-hidden="true"
                    className="h-4 w-4"
                  />
                </button>
                {isSettingsOpen ? (
                  <div
                    ref={settingsPanelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label={t("thread.settings.panelLabel")}
                    className="absolute right-0 top-full z-30 mt-3 w-72 rounded-2xl border border-white/15 bg-black/90 p-4 text-left shadow-xl backdrop-blur"
                  >
                    <div className="space-y-6">
                      <section>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/50">
                          {t("thread.settings.local.title")}
                        </p>
                        <p className="mt-1 text-xs text-white/50">
                          {t("thread.settings.local.description")}
                        </p>
                        <div className="mt-3 flex flex-col gap-2">
                          <PreferenceToggle
                            label={t("thread.settings.local.options.magnify.label")}
                            description={t("thread.settings.local.options.magnify.description")}
                            value={displaySettings.magnify}
                            theme={toggleTheme}
                            onChange={() =>
                              updateDisplaySettings((prev) => ({
                                ...prev,
                                magnify: !prev.magnify,
                              }))
                            }
                          />
                          <PreferenceToggle
                            label={t("thread.settings.local.options.labels.label")}
                            description={t("thread.settings.local.options.labels.description")}
                            value={displaySettings.showLabels}
                            theme={toggleTheme}
                            onChange={() =>
                              updateDisplaySettings((prev) => ({
                                ...prev,
                                showLabels: !prev.showLabels,
                              }))
                            }
                          />
                          <PreferenceToggle
                            label={t("thread.settings.local.options.theme.label")}
                            description={t("thread.settings.local.options.theme.description")}
                            value={displaySettings.theme === "light"}
                            theme={toggleTheme}
                            onChange={() =>
                              updateDisplaySettings((prev) => ({
                                ...prev,
                                theme: prev.theme === "light" ? "dark" : "light",
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={handleSyncHistory}
                            disabled={isSyncHistoryDisabled}
                            className={syncButtonClasses}
                          >
                            <span className={syncButtonLabelClasses}>
                              {isSyncingHistory
                                ? t("thread.settings.local.options.syncHistory.syncing")
                                : t("thread.settings.local.options.syncHistory.label")}
                            </span>
                            <span className={syncButtonDescriptionClasses}>
                              {t("thread.settings.local.options.syncHistory.description")}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={handleClearHistory}
                            disabled={isClearHistoryDisabled}
                            className={clearButtonClasses}
                          >
                            <span className={clearButtonLabelClasses}>
                              {t("thread.settings.local.options.clearHistory.label")}
                            </span>
                            <span className={clearButtonDescriptionClasses}>
                              {t("thread.settings.local.options.clearHistory.description")}
                            </span>
                          </button>
                        </div>
                      </section>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-4" ref={messageContainerRef}>
            {threadError ? (
              <p className="mb-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {threadError}
              </p>
            ) : null}

            {presenceToast ? (
              <div className="mb-4 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white/80 shadow-sm">
                {presenceToast}
              </div>
            ) : null}

            {isThreadLoading ? (
              <p className="text-sm text-white/60">{t("thread.loading")}</p>
            ) : null}

            {!isThreadLoading && !threadError && conversation ? (
              <>
                {nextCursor ? (
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={isFetchingMore}
                    className="mb-4 text-xs uppercase tracking-[0.3em] text-white/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isFetchingMore ? "Loading..." : "Load older messages"}
                  </button>
                ) : null}
                {visibleMessages.length > 0 ? (
                  <ul className="space-y-4">
                    {visibleMessages.map((message) => {
                      const isViewer = message.senderId === viewerId;
                      const timestamp = formatMessageTime(
                        message.createdAt,
                        locale,
                      );
                      return (
                        <li
                          key={message.id}
                          className={cn(
                            "max-w-xl rounded-2xl border",
                            bubblePaddingClasses,
                            bubbleTextClasses,
                            isViewer
                              ? viewerBubbleClasses
                              : "border-white/10 bg-black/50 text-white",
                          )}
                        >
                          {displaySettings.showLabels ? (
                            <div
                              className={cn(
                                "mb-1 flex items-center justify-between text-xs uppercase tracking-[0.3em]",
                                isViewer ? viewerMetaClasses : "text-white/50",
                              )}
                            >
                              <span>
                                {isViewer
                                  ? t("thread.me")
                                  : getContactName(message.sender)}
                              </span>
                              <span>{timestamp}</span>
                            </div>
                          ) : (
                            <p className="sr-only">
                              {isViewer
                                ? t("thread.me")
                                : getContactName(message.sender)}
                              {" "}
                              {timestamp}
                            </p>
                          )}
                          <p>{message.body}</p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-sm text-white/60">
                    {t("thread.empty")}
                  </p>
                )}
                {typingText ? (
                  <p className="mt-4 text-xs text-white/70">{typingText}</p>
                ) : null}
              </>
            ) : null}
          </div>
          <footer className="border-t border-white/10 px-6 py-4">
            <form className="flex flex-col gap-3" onSubmit={handleComposerSubmit}>
              {sendError ? (
                <p className="text-xs text-red-300">{sendError}</p>
              ) : null}
              <textarea
                value={draft}
                onChange={(event) => handleDraftChange(event.target.value)}
                placeholder={t("thread.composer.placeholder")}
                rows={3}
                disabled={!conversation || isSending}
                className="flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <div className="flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!conversation || isSending || !draft.trim()}
                  className="rounded-full bg-white px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSending
                    ? t("thread.composer.sending")
                    : t("thread.composer.send")}
                </button>
              </div>
            </form>
          </footer>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center text-white/70">
          <p className="text-lg font-semibold text-white">
            {t("thread.placeholder.title")}
          </p>
          <p className="max-w-sm text-sm">{t("thread.placeholder.body")}</p>
        </div>
      )}
    </section>
  );
}
