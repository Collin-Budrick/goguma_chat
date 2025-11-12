"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";

import type { FriendSummary } from "@/components/contacts/types";
import { getContactName, getInitials } from "@/components/contacts/types";
import { cn } from "@/lib/utils";

import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
  TypingEvent,
} from "./types";

type ChatClientProps = {
  viewerId: string;
  viewerProfile: ChatUserProfile;
  friends: FriendSummary[];
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

function formatRosterTime(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(toDate(value));
  } catch (error) {
    return value;
  }
}

function generateClientMessageId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `client-${crypto.randomUUID()}`;
  }
  return `client-${Math.random().toString(36).slice(2)}`;
}

function getFriendProfile(friendId: string | null, friends: FriendSummary[]) {
  if (!friendId) return null;
  return friends.find((friend) => friend.friendId === friendId) ?? null;
}

function friendToContactProfile(friend: FriendSummary) {
  return {
    id: friend.friendId,
    email: friend.email,
    firstName: friend.firstName,
    lastName: friend.lastName,
    image: friend.image,
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

export default function ChatClient({
  viewerId,
  viewerProfile,
  friends,
  initialFriendId,
  initialConversation,
  initialMessages,
  initialCursor,
}: ChatClientProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();

  const [search, setSearch] = useState("");
  const [activeFriendId, setActiveFriendId] = useState<string | null>(
    initialFriendId ?? friends[0]?.friendId ?? null,
  );
  const [conversation, setConversation] = useState<ChatConversation | null>(
    initialConversation,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [isThreadLoading, setIsThreadLoading] = useState(
    Boolean(activeFriendId) && !initialConversation,
  );
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [typingState, setTypingState] = useState<Record<string, number>>({});

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const bootstrapFriendRef = useRef(initialFriendId ?? null);
  const hasConsumedBootstrapRef = useRef(!initialConversation);
  const pendingThreadControllerRef = useRef<AbortController | null>(null);

  const friendProfile = useMemo(
    () => getFriendProfile(activeFriendId, friends),
    [activeFriendId, friends],
  );

  const activeFriendContact = useMemo(
    () => (friendProfile ? friendToContactProfile(friendProfile) : null),
    [friendProfile],
  );

  const viewerParticipant = useMemo(
    () => getParticipantProfile(conversation, viewerId) ?? viewerProfile,
    [conversation, viewerId, viewerProfile],
  );

  const filteredFriends = useMemo(() => {
    if (!search.trim()) {
      return friends;
    }
    const needle = search.trim().toLowerCase();
    return friends.filter((friend) => {
      const profile = friendToContactProfile(friend);
      const name = getContactName(profile).toLowerCase();
      const email = friend.email?.toLowerCase() ?? "";
      return name.includes(needle) || email.includes(needle);
    });
  }, [friends, search]);

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

  useEffect(() => {
    if (!friends.length) {
      setActiveFriendId(null);
      return;
    }
    if (
      activeFriendId &&
      friends.some((friend) => friend.friendId === activeFriendId)
    ) {
      return;
    }
    setActiveFriendId(friends[0]?.friendId ?? null);
  }, [activeFriendId, friends]);

  useEffect(() => {
    return () => {
      pendingThreadControllerRef.current?.abort();
      eventSourceRef.current?.close();
    };
  }, []);

  useEffect(() => {
    pendingThreadControllerRef.current?.abort();

    if (!activeFriendId) {
      setConversation(null);
      setMessages([]);
      setNextCursor(null);
      setThreadError(null);
      setIsThreadLoading(false);
      return;
    }

    if (
      !hasConsumedBootstrapRef.current &&
      bootstrapFriendRef.current === activeFriendId
    ) {
      hasConsumedBootstrapRef.current = true;
      setThreadError(null);
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
      body: JSON.stringify({ friendId: activeFriendId, limit: MESSAGE_LIMIT }),
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
  }, [activeFriendId, t]);

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
      } catch (eventError) {
        console.error("Failed to process message event", eventError);
      }
    });

    source.addEventListener("typing", (event) => {
      try {
        const payload = JSON.parse(event.data) as TypingEvent;
        if (payload.userId === viewerId) {
          return;
        }
        setTypingState((prev) => {
          const next = { ...prev };
          if (payload.isTyping) {
            next[payload.userId] = new Date(payload.expiresAt).getTime();
          } else {
            delete next[payload.userId];
          }
          return next;
        });
      } catch (eventError) {
        console.error("Failed to process typing event", eventError);
      }
    });

    source.addEventListener("error", () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    });

    return () => {
      source.close();
      if (eventSourceRef.current === source) {
        eventSourceRef.current = null;
      }
    };
  }, [conversation?.id, viewerId]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTypingState((prev) => {
        let changed = false;
        const next = { ...prev };
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
  }, []);

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

  const handleNewChatClick = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

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

  const rosterEmpty = friends.length === 0;
  const rosterHasMatches = filteredFriends.length > 0;
  const transportMode: "progressive" = "progressive";

  return (
    <div className="flex flex-col gap-6 lg:h-full lg:flex-row">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 text-white backdrop-blur lg:w-80">
        <div className="mb-6 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">
              {t("roster.title")}
            </p>
            <p className="text-sm text-white/80">{t("roster.createHint")}</p>
          </div>
          <button
            type="button"
            onClick={handleNewChatClick}
            disabled={rosterEmpty}
            className="rounded-full border border-white/30 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-white/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t("roster.new")}
          </button>
        </div>
        <div className="mb-4">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("roster.searchPlaceholder")}
            className="w-full rounded-2xl border border-white/20 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/60 focus:outline-none"
            autoComplete="off"
          />
        </div>
        <div className="h-[1px] w-full bg-white/10" />
        <div className="mt-4 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
          {rosterEmpty ? (
            <p className="text-sm text-white/60">{t("roster.empty")}</p>
          ) : rosterHasMatches ? (
            filteredFriends.map((friend) => {
              const profile = friendToContactProfile(friend);
              const isActive = friend.friendId === activeFriendId;
              return (
                <button
                  type="button"
                  key={friend.friendId}
                  onClick={() => setActiveFriendId(friend.friendId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition",
                    isActive
                      ? "border-white/50 bg-white/10"
                      : "border-transparent hover:border-white/20 hover:bg-white/5",
                  )}
                >
                  {friend.image ? (
                    <img
                      src={friend.image}
                      alt={getContactName(profile)}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
                      {getInitials(profile)}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {getContactName(profile)}
                    </p>
                    <p className="truncate text-xs text-white/60">
                      {friend.email ?? t("roster.emptyPreview")}
                    </p>
                    <p className="text-[11px] text-white/40">
                      {t("roster.lastActive", {
                        time: formatRosterTime(friend.createdAt, locale),
                      })}
                    </p>
                  </div>
                </button>
              );
            })
          ) : (
            <p className="text-sm text-white/60">{t("roster.emptyPreview")}</p>
          )}
        </div>
      </section>

      <section className="flex flex-1 flex-col rounded-3xl border border-white/10 bg-gradient-to-br from-black/60 via-black/40 to-black/30 text-white">
        {friendProfile && activeFriendContact ? (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-4">
                {friendProfile.image ? (
                  <img
                    src={friendProfile.image}
                    alt={getContactName(activeFriendContact)}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 text-base font-semibold">
                    {getInitials(activeFriendContact)}
                  </span>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("thread.header")}
                  </p>
                  <p className="text-sm text-white">
                    {t("thread.directWith", {
                      name: getContactName(activeFriendContact),
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
            </header>
            <div
              className="flex-1 overflow-y-auto px-6 py-4"
              ref={messageContainerRef}
            >
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
    </div>
  );
}

