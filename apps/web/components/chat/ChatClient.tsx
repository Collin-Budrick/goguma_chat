"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
