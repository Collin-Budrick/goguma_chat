"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import type { FriendSummary } from "@/components/contacts/types";
import {
  friendToContactProfile,
  getContactName,
  getInitials,
} from "@/components/contacts/types";

import { cn } from "@/lib/utils";

import ChatThread from "./ChatThread";
import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
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

function getFriendProfile(friendId: string | null, friends: FriendSummary[]) {
  if (!friendId) return null;
  return friends.find((friend) => friend.friendId === friendId) ?? null;
}

function toDate(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function formatRosterTime(value: string, locale: string) {
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(toDate(value));
  } catch {
    return value;
  }
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
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [activeFriendId, setActiveFriendId] = useState<string | null>(
    initialFriendId ?? friends[0]?.friendId ?? null,
  );

  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const friendProfile = useMemo(
    () => getFriendProfile(activeFriendId, friends),
    [activeFriendId, friends],
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

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleUpdate = (value: string | null) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        setActiveFriendId(value);
      }, 0);
    };

    if (!friends.length) {
      scheduleUpdate(null);
      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }

    if (
      activeFriendId &&
      friends.some((friend) => friend.friendId === activeFriendId)
    ) {
      return () => {
        if (timer) {
          clearTimeout(timer);
        }
      };
    }

    scheduleUpdate(friends[0]?.friendId ?? null);

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [activeFriendId, friends]);

  const handleNewChatClick = useCallback(() => {
    setSearch("");
    searchInputRef.current?.focus();
  }, []);

  const pushToFriendThread = useCallback(
    (friendId: string) => {
      router.push(`/${locale}/app/chat/${encodeURIComponent(friendId)}`);
    },
    [locale, router],
  );

  const handleOpenChat = useCallback(
    (friendId: string) => {
      pushToFriendThread(friendId);
    },
    [pushToFriendThread],
  );

  const handleFriendSelect = useCallback(
    (friend: FriendSummary) => {
      setActiveFriendId(friend.friendId);
      pushToFriendThread(friend.friendId);
    },
    [pushToFriendThread],
  );

  const rosterEmpty = friends.length === 0;
  const rosterHasMatches = filteredFriends.length > 0;

  const isBootstrapFriend = Boolean(
    friendProfile && initialFriendId === friendProfile.friendId,
  );

  const threadInitialFriendId = isBootstrapFriend ? initialFriendId : null;
  const threadInitialConversation = isBootstrapFriend
    ? initialConversation
    : null;
  const threadInitialMessages = isBootstrapFriend ? initialMessages : [];
  const threadInitialCursor = isBootstrapFriend ? initialCursor : null;

  return (
    <div className="flex flex-col gap-6 h-full min-h-0 w-full overflow-hidden lg:h-full lg:flex-row">
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
            className="h-9 w-9 rounded-full border border-white/30 text-xl text-white transition hover:border-white/60 disabled:cursor-not-allowed disabled:opacity-60"
          >
            +
          </button>
        </div>

        <div className="relative">
          <input
            ref={searchInputRef}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("roster.searchPlaceholder")}
            className="mb-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          />

          {rosterEmpty ? (
            <p className="text-sm text-white/60">{t("roster.empty")}</p>
          ) : rosterHasMatches ? (
            <div className="space-y-3">
              {filteredFriends.map((friend) => {
                const profile = friendToContactProfile(friend);
                const isActive = activeFriendId === friend.friendId;

                return (
                  <div
                    key={friend.friendshipId}
                    className={cn(
                      "overflow-hidden rounded-3xl border border-white/10 bg-black/20 backdrop-blur",
                      isActive ? "border-white/30" : "",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => handleFriendSelect(friend)}
                      className={cn(
                        "flex w-full items-center gap-3 px-3 py-3 text-left transition hover:bg-white/10",
                        isActive ? "bg-white/10" : "",
                      )}
                    >
                      {profile.image ? (
                        <img
                          src={profile.image}
                          alt={getContactName(profile)}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 text-base font-semibold">
                          {getInitials(profile)}
                        </span>
                      )}
                      <div className="flex flex-1 flex-col">
                        <span className="text-sm font-medium text-white">
                          {getContactName(profile)}
                        </span>
                        <span className="text-xs text-white/60">
                          {friend.email ?? t("roster.emptyPreview")}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-white/40">
                          {t("roster.lastActive", {
                            time: formatRosterTime(friend.createdAt, locale),
                          })}
                        </span>
                      </div>
                    </button>
                    {!friend.hasConversation ? (
                      <div className="border-t border-white/10 px-3 pb-3 pt-2">
                        <button
                          type="button"
                          onClick={() => handleOpenChat(friend.friendId)}
                          className="w-full rounded-full border border-white/30 px-3 py-2 text-[11px] uppercase tracking-[0.3em] text-white transition hover:border-white/60"
                        >
                          {t("roster.openChat")}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-white/60">{t("roster.emptyPreview")}</p>
          )}
        </div>
      </section>

      <ChatThread
        key={friendProfile?.friendId ?? "none"}
        viewerId={viewerId}
        viewerProfile={viewerProfile}
        friend={friendProfile}
        initialFriendId={threadInitialFriendId}
        initialConversation={threadInitialConversation}
        initialMessages={threadInitialMessages}
        initialCursor={threadInitialCursor}
      />
    </div>
  );
}
