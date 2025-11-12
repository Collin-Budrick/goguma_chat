"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";

import type {
  ContactSearchMatch,
  ContactsState,
  FriendRequestSummary,
  FriendSummary,
} from "./types";

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 350;

type ContactSearchProps = {
  friends: FriendSummary[];
  incoming: FriendRequestSummary[];
  outgoing: FriendRequestSummary[];
  onSync: (payload: Partial<ContactsState> | null | undefined) => void;
  onSendRequest: (match: ContactSearchMatch) => Promise<boolean>;
  onError: (message: string) => void;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export default function ContactSearch({
  friends,
  incoming,
  outgoing,
  onSync,
  onSendRequest,
  onError,
}: ContactSearchProps) {
  const t = useTranslations("WorkspaceContacts");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<ContactSearchMatch[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [pendingMatches, setPendingMatches] = useState<Record<string, boolean>>({});

  const statusMap = useMemo(() => {
    const map = new Map<string, "friend" | "incoming" | "outgoing">();

    friends.forEach((friend) => {
      map.set(friend.friendId, "friend");
    });

    incoming.forEach((request) => {
      map.set(request.senderId, "incoming");
    });

    outgoing.forEach((request) => {
      map.set(request.recipientId, "outgoing");
    });

    return map;
  }, [friends, incoming, outgoing]);

  useEffect(() => {
    const trimmed = query.trim();

    if (trimmed.length === 0) {
      setMatches([]);
      setIsSearching(false);
      return undefined;
    }

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setMatches([]);
      setIsSearching(false);
      return undefined;
    }

    const controller = new AbortController();
    setIsSearching(true);

    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/contacts/search?query=${encodeURIComponent(trimmed)}`,
          {
            signal: controller.signal,
          },
        );

        if (!response.ok) {
          const errorPayload = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(errorPayload.error ?? "Unable to search contacts");
        }

        const payload = (await response.json()) as Partial<ContactsState> & {
          matches?: ContactSearchMatch[];
        };
        onSync(payload);
        setMatches(payload.matches ?? []);
      } catch (error) {
        if (!isAbortError(error)) {
          console.error(error);
          onError(error instanceof Error ? error.message : t("errors.search"));
        }
      } finally {
        setIsSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [query, onSync, onError, t]);

  const handleAddFriend = async (match: ContactSearchMatch) => {
    setPendingMatches((previous) => ({ ...previous, [match.id]: true }));
    const success = await onSendRequest(match);
    setPendingMatches((previous) => {
      const { [match.id]: _removed, ...rest } = previous;
      return rest;
    });

    if (success) {
      setMatches((previous) => previous.filter((item) => item.id !== match.id));
    }
  };

  const disableInput = isSearching;
  const trimmedQuery = query.trim();

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/80">
      <header className="mb-4 space-y-2">
        <h2 className="text-lg font-semibold text-white">{t("search.title")}</h2>
        <p className="text-xs text-white/50">
          {t("search.hint", { count: MIN_QUERY_LENGTH })}
        </p>
      </header>
      <div className="space-y-4">
        <label className="block text-xs uppercase tracking-[0.3em] text-white/40">
          {t("search.label")}
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("search.placeholder")}
            disabled={disableInput}
            className="mt-2 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none disabled:cursor-not-allowed disabled:border-white/5 disabled:text-white/40"
          />
        </label>
        {trimmedQuery.length > 0 && trimmedQuery.length < MIN_QUERY_LENGTH ? (
          <p className="text-xs text-white/40">{t("search.tooShort")}</p>
        ) : null}
        {isSearching ? (
          <p className="text-xs text-white/40">{t("search.loading")}</p>
        ) : null}
        {!isSearching && matches.length === 0 && trimmedQuery.length >= MIN_QUERY_LENGTH ? (
          <p className="rounded-2xl border border-white/10 bg-black/40 px-4 py-6 text-center text-sm text-white/50">
            {t("search.empty")}
          </p>
        ) : null}
        {matches.length > 0 ? (
          <ul className="space-y-3">
            {matches.map((match) => {
              const status = statusMap.get(match.id);
              const isPending = Boolean(pendingMatches[match.id]);
              const disabled =
                status === "friend" || status === "incoming" || status === "outgoing";
              const badgeLabel =
                status === "friend"
                  ? t("search.status.friend")
                  : status === "incoming"
                  ? t("search.status.incoming")
                  : status === "outgoing"
                  ? t("search.status.outgoing")
                  : null;

              return (
                <li
                  key={match.id}
                  className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-white">
                        {[match.firstName, match.lastName]
                          .filter(Boolean)
                          .join(" ") || match.email || match.id}
                      </p>
                      {match.email ? (
                        <p className="text-xs text-white/50">{match.email}</p>
                      ) : null}
                    </div>
                    {badgeLabel ? (
                      <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] uppercase tracking-[0.25em] text-white/60">
                        {badgeLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={disabled || isPending}
                      onClick={() => handleAddFriend(match)}
                      className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/50 disabled:text-black/50"
                    >
                      {t("search.action")}
                    </button>
                    {isPending ? (
                      <span className="text-xs text-white/50">
                        {t("search.pending")}
                      </span>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
