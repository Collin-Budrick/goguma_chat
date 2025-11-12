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
      </section>
    </div>
  );
}
