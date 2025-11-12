"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type { FriendSummary } from "@/components/contacts/types";
import { getContactName, getInitials } from "@/components/contacts/types";
import { cn } from "@/lib/utils";

import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
  TypingEvent,
} from "./types";

function toDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatTime(value: string) {
  return toDate(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

function getParticipantProfile(
  conversation: ChatConversation | null,
  userId: string,
): ChatUserProfile | null {
  if (!conversation) return null;
  return (
    conversation.participants.find((participant) => participant.userId === userId)
      ?.user ?? null
  );
  type FormEvent,
} from "react";
import { useLocale, useTranslations } from "next-intl";

import type { FriendSummary } from "@/components/contacts/types";
import { getContactName, getInitials } from "@/components/contacts/types";
import type { ChatHistory, ChatMessage, SendMessageResponse } from "@/lib/chat/types";
import {
  MESSAGING_MODE_EVENT,
  type MessagingMode,
} from "@/lib/messaging-mode";
import { initializeMessagingTransport } from "@/lib/messaging-transport";
import { cn } from "@/lib/utils";

type ViewerProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
};

type ChatClientProps = {
  viewer: ViewerProfile;
  friends: FriendSummary[];
};

type ConversationState = {
  conversationId: string;
  messages: ChatMessage[];
};

type ConversationMap = Record<string, ConversationState>;

function isAbortError(error: unknown): error is DOMException {
  return error instanceof DOMException && error.name === "AbortError";
}

function formatDateTime(value: string, locale: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  } catch (error) {
    return value;
  }
}

function formatTime(value: string, locale: string) {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch (error) {
    return value;
  }
}

function ellipsize(value: string, limit = 72) {
  if (!value) return "";
  if (value.length <= limit) return value;
  return `${value.slice(0, limit - 1)}…`;
}

function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
): ChatMessage[] {
  const seen = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    seen.set(message.id, message);
  }
  return Array.from(seen.values()).sort((a, b) =>
    toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
  );
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
  const [activeFriendId, setActiveFriendId] = useState<string | null>(
    initialFriendId ?? friends[0]?.friendId ?? null,
  );
  const [conversation, setConversation] = useState<ChatConversation | null>(
    initialConversation,
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [nextCursor, setNextCursor] = useState<string | null>(initialCursor);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  const [typingState, setTypingState] = useState<Record<string, number>>({});

  const typingTimeoutRef = useRef<number | null>(null);
  const typingActiveRef = useRef(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const friendProfile = useMemo(
    () => getFriendProfile(activeFriendId, friends),
    [activeFriendId, friends],
  );

  const viewerParticipant = useMemo(
    () => getParticipantProfile(conversation, viewerId) ?? viewerProfile,
    [conversation, viewerId, viewerProfile],
  );

  useEffect(() => {
    if (!activeFriendId) {
      setConversation(null);
      setMessages([]);
      setNextCursor(null);
      return;
    }

    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    fetch("/api/conversations/direct", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ friendId: activeFriendId }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(payload.error ?? "Failed to load conversation");
        }
        return response.json();
      })
      .then(
        (data: {
          conversation: ChatConversation;
          messages: ChatMessage[];
          nextCursor: string | null;
        }) => {
          setConversation(data.conversation);
          setMessages(data.messages);
          setNextCursor(data.nextCursor);
        },
      )
      .catch((loadError) => {
        if (controller.signal.aborted) {
          return;
        }
        console.error(loadError);
        setConversation(null);
        setMessages([]);
        setNextCursor(null);
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load conversation",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => {
      controller.abort();
    };
  }, [activeFriendId]);

  useEffect(() => {
    if (!conversation) {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      return;
    }

    const source = new EventSource(
      `/api/conversations/${conversation.id}/events`,
    );
    eventSourceRef.current = source;

    source.addEventListener("message", (event) => {
      try {
        const payload = JSON.parse(event.data) as MessageEventPayload;
        const incoming = payload.message;

        setMessages((prev) => {
          const withoutClient = payload.clientMessageId
            ? prev.filter((msg) => msg.id !== payload.clientMessageId)
            : prev;
          const exists = withoutClient.some((msg) => msg.id === incoming.id);
          const next = exists
            ? withoutClient.map((msg) => (msg.id === incoming.id ? incoming : msg))
            : [...withoutClient, incoming];
          return next.sort(
            (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
          );
        });

        setConversation((prev) =>
          prev ? { ...prev, updatedAt: incoming.createdAt } : prev,
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
      eventSourceRef.current = null;
      setTimeout(() => {
        setConversation((prev) => (prev ? { ...prev } : prev));
      }, 2_000);
    });

    return () => {
      source.close();
      eventSourceRef.current = null;
    };
  }, [conversation, viewerId]);

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

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversation) {
        return;
      }

      fetch("/api/messages/typing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversation.id,
          isTyping,
        }),
      }).catch(() => {
        // Ignore typing errors.
      });
    },
    [conversation],
  );

  const handleDraftChange = useCallback(
    (value: string) => {
      setDraft(value);
      if (!conversation) {
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
        }, 2_000);
      } else if (typingActiveRef.current) {
        typingActiveRef.current = false;
        sendTyping(false);
      }
    },
    [conversation, sendTyping],
  );

  const handleSend = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault();

      if (!conversation) {
        return;
      }

      const trimmed = draft.trim();
      if (!trimmed) {
        return;
      }

      const clientMessageId = generateClientMessageId();
      const optimisticMessage: ChatMessage = {
        id: clientMessageId,
        conversationId: conversation.id,
        senderId: viewerId,
        body: trimmed,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sender: viewerParticipant ?? viewerProfile,
      };

      setMessages((prev) => [...prev, optimisticMessage]);
      setDraft("");
      setError(null);
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
            conversationId: conversation.id,
            body: trimmed,
            clientMessageId,
  const map = new Map(existing.map((message) => [message.id, message]));
  for (const message of incoming) {
    map.set(message.id, message);
  }
  return Array.from(map.values()).sort((a, b) => {
    const left = new Date(a.sentAt).getTime();
    const right = new Date(b.sentAt).getTime();
    return left - right;
  });
}

function getDisplayName(viewer: ViewerProfile) {
  const first = viewer.firstName?.trim();
  const last = viewer.lastName?.trim();
  const combined = [first, last].filter(Boolean).join(" ");
  if (combined) return combined;
  if (viewer.email) return viewer.email;
  return "";
}

export default function ChatClient({ viewer, friends }: ChatClientProps) {
  const t = useTranslations("Chat");
  const locale = useLocale();
  const [search, setSearch] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [activeFriendId, setActiveFriendId] = useState<string | null>(
    friends[0]?.friendId ?? null,
  );
  const [conversations, setConversations] = useState<ConversationMap>({});
  const [transportMode, setTransportMode] = useState<MessagingMode>("progressive");
  const [threadError, setThreadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isThreadLoading, setIsThreadLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [draft, setDraft] = useState("");

  const viewerName = useMemo(() => getDisplayName(viewer), [viewer]);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const messageContainerRef = useRef<HTMLDivElement | null>(null);
  const fetchControllerRef = useRef<AbortController | null>(null);

  const filteredFriends = useMemo(() => {
    if (!search.trim()) {
      return friends;
    }
    const query = search.trim().toLowerCase();
    return friends.filter((friend) => {
      const profile = {
        id: friend.friendId,
        email: friend.email,
        firstName: friend.firstName,
        lastName: friend.lastName,
        image: friend.image,
      };
      const name = getContactName(profile).toLowerCase();
      const email = friend.email?.toLowerCase() ?? "";
      return name.includes(query) || email.includes(query);
    });
  }, [friends, search]);

  const selectedFriend = useMemo(
    () => friends.find((friend) => friend.friendId === activeFriendId) ?? null,
    [friends, activeFriendId],
  );

  const activeConversation = activeFriendId
    ? conversations[activeFriendId] ?? null
    : null;

  const messageCount = activeConversation?.messages.length ?? 0;

  useEffect(() => {
    const controller = initializeMessagingTransport({
      onModeChange: (mode) => setTransportMode(mode),
    });

    const refresh = () => controller.refresh();
    if (typeof window !== "undefined") {
      window.addEventListener(MESSAGING_MODE_EVENT, refresh);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(MESSAGING_MODE_EVENT, refresh);
      }
      controller.teardown();
    };
  }, []);

  useEffect(() => {
    if (friends.length === 0) {
      setActiveFriendId(null);
      return;
    }

    if (!activeFriendId && !isCreating) {
      setActiveFriendId(friends[0]?.friendId ?? null);
    }
  }, [friends, activeFriendId, isCreating]);

  useEffect(() => {
    if (activeFriendId && !friends.some((f) => f.friendId === activeFriendId)) {
      setActiveFriendId(friends[0]?.friendId ?? null);
    }
  }, [friends, activeFriendId]);

  const hasActiveConversation = useMemo(() => {
    return activeFriendId ? Boolean(conversations[activeFriendId]) : false;
  }, [activeFriendId, conversations]);

  useEffect(() => {
    return () => {
      fetchControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setThreadError(null);
    setSendError(null);
  }, [activeFriendId]);

  useEffect(() => {
    if (!activeFriendId || hasActiveConversation) {
      return () => undefined;
    }

    const controller = new AbortController();
    fetchControllerRef.current?.abort();
    fetchControllerRef.current = controller;

    setIsThreadLoading(true);
    setThreadError(null);

    const loadHistory = async () => {
      try {
        const response = await fetch(
          `/api/chat/history?friendId=${encodeURIComponent(activeFriendId)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Failed to load conversation");
        }

        const payload = (await response.json()) as ChatHistory;
        if (controller.signal.aborted) {
          return;
        }

        setConversations((previous) => ({
          ...previous,
          [activeFriendId]: {
            conversationId: payload.conversationId,
            messages: mergeMessages([], payload.messages),
          },
        }));
      } catch (error) {
        if (controller.signal.aborted || isAbortError(error)) {
          return;
        }
        setThreadError(t("alerts.history"));
      } finally {
        if (!controller.signal.aborted) {
          setIsThreadLoading(false);
        }
      }
    };

    loadHistory();

    return () => {
      controller.abort();
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
    };
  }, [activeFriendId, hasActiveConversation, t]);

  useEffect(() => {
    if (!activeFriendId) return;
    const container = messageContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [activeFriendId, messageCount]);

  useEffect(() => {
    if (isCreating) {
      searchInputRef.current?.focus();
    }
  }, [isCreating]);

  const handleSelectFriend = useCallback(
    (friendId: string) => {
      setActiveFriendId(friendId);
      setIsCreating(false);
      setSearch("");
    },
    [],
  );

  const handleStartNewChat = useCallback(() => {
    setSearch("");
    setIsCreating(true);
    setActiveFriendId(null);
  }, []);

  const handleComposerSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!activeFriendId) return;
      const content = draft.trim();
      if (!content) return;

      setIsSending(true);
      setSendError(null);

      try {
        const response = await fetch("/api/chat/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            friendId: activeFriendId,
            content,
            mode: transportMode,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as ApiError;
          throw new Error(payload.error ?? "Failed to send message");
        }

        const data = (await response.json()) as { message: ChatMessage };
        setMessages((prev) => {
          const withoutOptimistic = prev.filter(
            (message) => message.id !== clientMessageId,
          );
          const exists = withoutOptimistic.some(
            (message) => message.id === data.message.id,
          );
          const next = exists
            ? withoutOptimistic.map((message) =>
                message.id === data.message.id ? data.message : message,
              )
            : [...withoutOptimistic, data.message];
          return next.sort(
            (a, b) => toDate(a.createdAt).getTime() - toDate(b.createdAt).getTime(),
          );
        });
        setConversation((prev) =>
          prev ? { ...prev, updatedAt: data.message.createdAt } : prev,
        );
      } catch (sendError) {
        console.error(sendError);
        setMessages((prev) =>
          prev.filter((message) => message.id !== clientMessageId),
        );
        setDraft(trimmed);
        setError(
          sendError instanceof Error ? sendError.message : "Failed to send message",
        );
      }
    },
    [conversation, draft, viewerId, viewerParticipant, viewerProfile, sendTyping],
  );

  const handleLoadMore = useCallback(async () => {
    if (!conversation || !nextCursor || isFetchingMore) {
      return;
    }

    setIsFetchingMore(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/conversations/${conversation.id}/messages?cursor=${encodeURIComponent(
          nextCursor,
        )}`,
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ApiError;
        throw new Error(payload.error ?? "Failed to load messages");
      }

      const data = (await response.json()) as {
        messages: ChatMessage[];
        nextCursor: string | null;
      };

      setMessages((prev) => mergeMessages(data.messages, prev));
      setNextCursor(data.nextCursor);
    } catch (fetchError) {
      console.error(fetchError);
      setError(
        fetchError instanceof Error ? fetchError.message : "Failed to load messages",
      );
    } finally {
      setIsFetchingMore(false);
    }
  }, [conversation, nextCursor, isFetchingMore]);

  const typingParticipants = useMemo(() => {
    if (!conversation) {
      return [] as ChatUserProfile[];
    }

    const now = Date.now();

    return conversation.participants
      .map((participant) => participant.user)
      .filter((profile) =>
        profile.id !== viewerId && typingState[profile.id] && typingState[profile.id] > now,
      );
  }, [conversation, typingState, viewerId]);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (typingTimeoutRef.current) {
        window.clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div className="grid min-h-[540px] gap-6 lg:grid-cols-[260px,1fr]">
      <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <header className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.3em] text-white/50">
          <span>Friends</span>
          <span className="text-white/30">{friends.length}</span>
        </header>
        <ul className="space-y-2">
          {friends.map((friend) => {
            const isActive = friend.friendId === activeFriendId;
            return (
              <li key={friend.friendshipId}>
                <button
                  type="button"
                  onClick={() => setActiveFriendId(friend.friendId)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition",
                    isActive
                      ? "border-white/60 bg-white text-black shadow"
                      : "border-white/10 bg-black/40 text-white hover:border-white/30",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs uppercase">
                    {getInitials({
                      id: friend.friendId,
                      email: friend.email,
                      firstName: friend.firstName,
                      lastName: friend.lastName,
                      image: friend.image,
                    })}
                  </span>
                  <div>
                    <div className="text-sm font-medium">
                      {getContactName({
                        id: friend.friendId,
                        email: friend.email,
                        firstName: friend.firstName,
                        lastName: friend.lastName,
                        image: friend.image,
                      })}
                    </div>
                    <div className="text-xs text-white/60">
                      Friends since {new Date(friend.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
          {friends.length === 0 && (
            <li className="rounded-2xl border border-dashed border-white/20 px-3 py-6 text-center text-xs text-white/60">
              Add friends to start a conversation.
            </li>
          )}
        </ul>
      </aside>
      <section className="flex min-h-[540px] flex-col rounded-3xl border border-white/10 bg-white/[0.02]">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">Chat</p>
            <p className="text-lg font-semibold text-white">
              {friendProfile
                ? getContactName({
                    id: friendProfile.friendId,
                    email: friendProfile.email,
                    firstName: friendProfile.firstName,
                    lastName: friendProfile.lastName,
                    image: friendProfile.image,
                  })
                : "Select a friend"}
            </p>
            {typingParticipants.length > 0 && (
              <p className="text-xs text-white/60">
                {typingParticipants.map(getContactName).join(", ")} typing…
              </p>
            )}
          </div>
          {conversation && (
            <div className="text-right text-xs text-white/50">
              <p>Last update</p>
              <p>{formatTime(conversation.updatedAt)}</p>
            </div>
          )}
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
          {isLoading && (
            <p className="text-sm text-white/60">Loading conversation…</p>
          )}
          {error && (
            <p className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </p>
          )}
          {conversation && nextCursor && (
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isFetchingMore}
              className="text-xs text-white/60 hover:text-white disabled:opacity-50"
            >
              {isFetchingMore ? "Loading…" : "Load older messages"}
            </button>
          )}
          {messages.map((message) => {
            const isViewer = message.senderId === viewerId;
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-lg rounded-2xl border px-4 py-3 text-sm leading-6",
                  isViewer
                    ? "ml-auto border-white/40 bg-white text-black"
                    : "border-white/10 bg-black text-white",
                )}
              >
                <div
                  className={cn(
                    "mb-1 flex items-center justify-between text-xs",
                    isViewer ? "text-black/60" : "text-white/60",
                  )}
                >
                  <span>{getContactName(message.sender)}</span>
                  <span>{formatTime(message.createdAt)}</span>
                </div>
                <p>{message.body}</p>
              </div>
            );
          })}
          {messages.length === 0 && !isLoading && !error && (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-sm text-white/60">
              Start the conversation with a friendly hello.
            </p>
          )}
        </div>
        <footer className="border-t border-white/10 px-6 py-4">
          <form className="flex items-center gap-3" onSubmit={handleSend}>
            <textarea
              rows={1}
              value={draft}
              onChange={(event) => handleDraftChange(event.target.value)}
              placeholder={friendProfile ? "Send a message" : "Select a friend to chat"}
              disabled={!conversation}
              className="flex-1 resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!conversation || !draft.trim()}
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:opacity-50"
            >
              Send
            </button>
          </form>
        </footer>
          throw new Error("Failed to send message");
        }

        const payload = (await response.json()) as SendMessageResponse;

        setConversations((previous) => {
          const existing = previous[activeFriendId];
          const base: ConversationState =
            existing ?? {
              conversationId: payload.conversationId,
              messages: [],
            };

          const nextMessages = mergeMessages(base.messages, [payload.message]);
          const replies = payload.replies ?? [];
          const merged = mergeMessages(nextMessages, replies);

          return {
            ...previous,
            [activeFriendId]: {
              conversationId: payload.conversationId,
              messages: merged,
            },
          };
        });

        setDraft("");
      } catch (error) {
        setSendError(t("alerts.send"));
      } finally {
        setIsSending(false);
      }
    },
    [activeFriendId, draft, transportMode, t],
  );

  const rosterItems = useMemo(() => {
    return filteredFriends.map((friend) => {
      const profile = {
        id: friend.friendId,
        email: friend.email,
        firstName: friend.firstName,
        lastName: friend.lastName,
        image: friend.image,
      };
      const name = getContactName(profile);
      const initials = getInitials(profile);
      const conversation = conversations[friend.friendId];
      const lastMessage = conversation?.messages.length
        ? conversation.messages[conversation.messages.length - 1]
        : undefined;
      const preview = lastMessage
        ? ellipsize(lastMessage.body)
        : t("roster.emptyPreview");
      const lastActiveDate = lastMessage?.sentAt ?? friend.createdAt;
      const lastActive = formatDateTime(lastActiveDate, locale);

      return {
        friend,
        name,
        initials,
        preview,
        lastActive,
      };
    });
  }, [conversations, filteredFriends, locale, t]);

  return (
    <div className="grid min-h-[540px] gap-6 lg:grid-cols-[320px,1fr]">
      <aside className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.03] p-5">
        <header className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.35em] text-white/50">
          <span>{t("roster.title")}</span>
          <button
            type="button"
            onClick={handleStartNewChat}
            disabled={friends.length === 0}
            className="text-white transition hover:text-white/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("roster.new")}
          </button>
        </header>
        <div className="mb-4">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("roster.searchPlaceholder")}
            disabled={friends.length === 0}
            className="w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          />
          <p className="mt-2 text-xs text-white/40">{t("roster.createHint")}</p>
        </div>
        {friends.length === 0 ? (
          <p className="mt-auto rounded-2xl border border-white/10 bg-black/30 px-4 py-6 text-center text-sm text-white/50">
            {t("roster.empty")}
          </p>
        ) : (
          <ul className="flex-1 space-y-3 overflow-y-auto pr-1">
            {rosterItems.map(({ friend, name, initials, preview, lastActive }) => {
              const isActive = friend.friendId === activeFriendId;
              return (
                <li key={friend.friendshipId}>
                  <button
                    type="button"
                    onClick={() => handleSelectFriend(friend.friendId)}
                    className={cn(
                      "w-full rounded-2xl border px-4 py-3 text-left transition",
                      isActive
                        ? "border-white/50 bg-white text-black shadow-lg"
                        : "border-white/10 bg-black/20 text-white hover:border-white/30 hover:bg-black/30",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {friend.image ? (
                        <img
                          src={friend.image}
                          alt={name}
                          className={cn(
                            "h-10 w-10 rounded-full border object-cover",
                            isActive ? "border-black/10" : "border-white/10",
                          )}
                        />
                      ) : (
                        <span
                          className={cn(
                            "flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold",
                            isActive
                              ? "border-black/10 bg-black/5 text-black/70"
                              : "border-white/10 bg-white/10 text-white",
                          )}
                        >
                          {initials}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-sm font-semibold",
                            isActive ? "text-black" : "text-white",
                          )}
                        >
                          {name}
                        </p>
                        <p
                          className={cn(
                            "mt-1 truncate text-xs",
                            isActive ? "text-black/70" : "text-white/60",
                          )}
                        >
                          {preview}
                        </p>
                      </div>
                    </div>
                    <div
                      className={cn(
                        "mt-3 text-xs",
                        isActive ? "text-black/50" : "text-white/40",
                      )}
                    >
                      {t("roster.lastActive", { time: lastActive })}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.02]">
        {selectedFriend ? (
          <>
            <header className="flex items-center justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div className="flex items-center gap-3">
                {selectedFriend.image ? (
                  <img
                    src={selectedFriend.image}
                    alt={getContactName({
                      id: selectedFriend.friendId,
                      email: selectedFriend.email,
                      firstName: selectedFriend.firstName,
                      lastName: selectedFriend.lastName,
                      image: selectedFriend.image,
                    })}
                    className="h-12 w-12 rounded-full border border-white/20 object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10 text-base font-semibold text-white">
                    {getInitials({
                      id: selectedFriend.friendId,
                      email: selectedFriend.email,
                      firstName: selectedFriend.firstName,
                      lastName: selectedFriend.lastName,
                      image: selectedFriend.image,
                    })}
                  </span>
                )}
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/40">
                    {t("thread.header")}
                  </p>
                  <p className="text-sm text-white">
                    {t("thread.directWith", {
                      name: getContactName({
                        id: selectedFriend.friendId,
                        email: selectedFriend.email,
                        firstName: selectedFriend.firstName,
                        lastName: selectedFriend.lastName,
                        image: selectedFriend.image,
                      }),
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
            <div className="flex-1 overflow-y-auto px-6 py-6" ref={messageContainerRef}>
              {threadError ? (
                <p className="rounded-2xl border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {threadError}
                </p>
              ) : null}
              {isThreadLoading ? (
                <p className="text-sm text-white/60">{t("thread.loading")}</p>
              ) : null}
              {!isThreadLoading && !threadError ? (
                activeConversation && activeConversation.messages.length > 0 ? (
                  <ul className="space-y-4">
                    {activeConversation.messages.map((message) => {
                      const isViewer = message.authorId === viewer.id;
                      const timestamp = formatTime(message.sentAt, locale);
                      return (
                        <li
                          key={message.id}
                          className={cn(
                            "max-w-lg rounded-2xl border px-4 py-3 text-sm leading-6",
                            isViewer
                              ? "ml-auto border-white/40 bg-white text-black"
                              : "border-white/10 bg-black/60 text-white",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-1 flex items-center justify-between text-xs uppercase tracking-[0.3em]",
                              isViewer ? "text-black/50" : "text-white/50",
                            )}
                          >
                            <span>{isViewer ? viewerName || t("thread.me") : getContactName({
                              id: selectedFriend.friendId,
                              email: selectedFriend.email,
                              firstName: selectedFriend.firstName,
                              lastName: selectedFriend.lastName,
                              image: selectedFriend.image,
                            })}</span>
                            <span>{timestamp}</span>
                          </div>
                          <p>{message.body}</p>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="rounded-2xl border border-white/10 bg-black/30 px-4 py-6 text-sm text-white/60">
                    {t("thread.empty")}
                  </p>
                )
              ) : null}
            </div>
            <footer className="border-t border-white/10 px-6 py-4">
              <form className="flex flex-col gap-3" onSubmit={handleComposerSubmit}>
                {sendError ? (
                  <p className="text-xs text-red-300">{sendError}</p>
                ) : null}
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t("thread.composer.placeholder")}
                  rows={2}
                  disabled={isSending}
                  className="flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
                />
                <div className="flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={isSending || !draft.trim()}
                    className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-center text-white/60">
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
