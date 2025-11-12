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
import { cn } from "@/lib/utils";

import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
  TypingEvent,
} from "./types";

type ChatThreadProps = {
  viewerId: string;
  viewerProfile: ChatUserProfile;
  friend: FriendSummary | null;
  initialFriendId: string | null;
  initialConversation: ChatConversation | null;
  initialMessages: ChatMessage[];
  initialCursor: string | null;
};

type ApiError = {
  error?: string;
};

type MessageEventPayload = {
  message: ChatMessage;
  clientMessageId: string | null;
};

const MESSAGE_LIMIT = 30;
const TYPING_DEBOUNCE_MS = 2_000;

function generateClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }
  return `client-${Math.random().toString(36).slice(2)}`;
}

function toDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatMessageTime(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(toDate(value));
  } catch (error) {
    return value;
  }
}

function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const seen = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    seen.set(message.id, message);
  }
  return Array.from(seen.values()).sort(
    (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
  );
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

  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
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

  useEffect(() => {
    return () => {
      pendingThreadControllerRef.current?.abort();
      eventSourceRef.current?.close();
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

    setConversation(null);
    setMessages([]);
    setNextCursor(null);
    setThreadError(null);
    setSendError(null);
    setDraft("");
    setTypingState({});
    setIsThreadLoading(true);

    fetch("/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId, limit: MESSAGE_LIMIT }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(payload.error ?? "Failed to load conversation");
        }
        return response.json() as Promise<{
          conversation: ChatConversation;
          messages: ChatMessage[];
          nextCursor: string | null;
        }>;
      })
      .then((payload) => {
        setConversation(payload.conversation);
        setMessages(payload.messages);
        setNextCursor(payload.nextCursor ?? null);
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
  }, [friendId, shouldUseInitialData, t]);

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

    fetch(`/api/conversations/${conversation.id}/read`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    }).catch((error) => {
      if (error instanceof Error && error.name === "AbortError") {
        return;
      }
      console.error("Failed to mark conversation as read", error);
      lastConversationReadKeyRef.current = null;
    });

    return () => controller.abort();
  }, [conversation?.id, lastMessageId]);

  useEffect(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    if (!conversation?.id) {
      setTypingState({});
      typingActiveRef.current = false;
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      return;
    }

    const source = new EventSource(`/api/conversations/${conversation.id}/events`);
    eventSourceRef.current = source;

    source.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as MessageEventPayload;
        setMessages((prev) => {
          const withoutClient = payload.clientMessageId
            ? prev.filter((message) => message.id !== payload.clientMessageId)
            : prev;
          return mergeMessages(withoutClient, [payload.message]);
        });
        setConversation((prev) =>
          prev ? { ...prev, updatedAt: payload.message.createdAt } : prev,
        );
      } catch (error) {
        console.error("Failed to parse message event", error);
      }
    });

    source.addEventListener("typing", (event) => {
      try {
        const payload = JSON.parse(event.data) as TypingEvent;
        setTypingState((prev) => ({ ...prev, [payload.userId]: payload.expiresAt }));
      } catch (error) {
        console.error("Failed to parse typing event", error);
      }
    });

    return () => {
      source.close();
    };
  }, [conversation?.id]);

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
  }, [conversation?.id, messages.length, isFetchingMore]);

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

  const conversationId = conversation?.id ?? null;

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationId) {
        return;
      }
      fetch("/api/messages/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          isTyping,
        }),
      }).catch(() => {
        // Best effort typing indicator.
      });
    },
    [conversationId],
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
        const response = await fetch("/api/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId,
            body: content,
            clientMessageId,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(payload.error ?? t("alerts.send"));
        }

        const payload = (await response.json()) as { message: ChatMessage };
        setMessages((prev) => {
          const withoutClient = prev.filter(
            (message) => message.id !== clientMessageId,
          );
          return mergeMessages(withoutClient, [payload.message]);
        });
        setConversation((prev) =>
          prev ? { ...prev, updatedAt: payload.message.createdAt } : prev,
        );
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
    [conversation, conversationId, draft, sendTyping, t, viewerId, viewerParticipant],
  );

  const handleLoadMore = useCallback(async () => {
    if (!conversationId || !nextCursor || isFetchingMore) {
      return;
    }

    setIsFetchingMore(true);
    setThreadError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversationId}/messages?cursor=${encodeURIComponent(
          nextCursor,
        )}&limit=${MESSAGE_LIMIT}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(payload.error ?? "Failed to load messages");
      }

      const payload = (await response.json()) as {
        messages: ChatMessage[];
        nextCursor: string | null;
      };

      setMessages((prev) => mergeMessages(payload.messages, prev));
      setNextCursor(payload.nextCursor ?? null);
    } catch (error) {
      console.error("Failed to load more messages", error);
      setThreadError(t("alerts.history"));
    } finally {
      setIsFetchingMore(false);
    }
  }, [conversationId, isFetchingMore, nextCursor, t]);

  const transportMode: "progressive" = "progressive";

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
              <div className="text-right text-xs text-white/50">
                <p className="uppercase tracking-[0.3em]">
                  {t("thread.transport.label")}
                </p>
                <p>{t(`thread.transport.mode.${transportMode}`)}</p>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-4" ref={messageContainerRef}>
            {threadError ? (
              <p className="mb-4 rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {threadError}
              </p>
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
                {messages.length > 0 ? (
                  <ul className="space-y-4">
                    {messages.map((message) => {
                      const isViewer = message.senderId === viewerId;
                      const timestamp = formatMessageTime(
                        message.createdAt,
                        locale,
                      );
                      return (
                        <li
                          key={message.id}
                          className={cn(
                            "max-w-xl rounded-2xl border px-4 py-3 text-sm leading-6",
                            isViewer
                              ? "ml-auto border-white/40 bg-white text-black"
                              : "border-white/10 bg-black/50 text-white",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-1 flex items-center justify-between text-xs uppercase tracking-[0.3em]",
                              isViewer ? "text-black/50" : "text-white/50",
                            )}
                          >
                            <span>
                              {isViewer
                                ? t("thread.me")
                                : getContactName(message.sender)}
                            </span>
                            <span>{timestamp}</span>
                          </div>
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
