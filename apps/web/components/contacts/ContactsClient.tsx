"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useReducer,
	useState,
	useTransition,
} from "react";
import { useLocale, useTranslations } from "next-intl";

import FriendList from "./FriendList";
import FriendRequestList from "./FriendRequestList";
import ContactSearch from "./ContactSearch";
import type {
	ContactSearchMatch,
	ContactsState,
	FriendRequestSummary,
	FriendSummary,
} from "./types";

export type ContactsClientProps = {
	cacheKey: string;
	viewerId: string;
	initialState: ContactsState;
};

type ContactsAction =
	| { type: "hydrate"; payload: ContactsState }
	| { type: "sync"; payload: ContactsState }
	| { type: "addFriend"; payload: FriendSummary }
	| { type: "removeFriend"; friendshipId: string }
	| { type: "addIncoming"; payload: FriendRequestSummary }
	| { type: "removeIncoming"; requestId: string }
	| { type: "addOutgoing"; payload: FriendRequestSummary }
	| { type: "removeOutgoing"; requestId: string };

function generateId(prefix: string) {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return `${prefix}-${crypto.randomUUID()}`;
	}
	return `${prefix}-${Math.random().toString(36).slice(2)}`;
}

function toISOString(value: unknown, fallback?: string) {
	if (value === undefined || value === null) {
		return fallback ?? new Date().toISOString();
	}

	const normalizedValue =
		value instanceof Date
			? value
			: typeof value === "string" || typeof value === "number"
				? value
				: null;

	if (normalizedValue === null) {
		return fallback ?? new Date().toISOString();
	}

	const date = new Date(normalizedValue);
	if (Number.isNaN(date.getTime())) {
		return fallback ?? new Date().toISOString();
	}

	return date.toISOString();
}

function ensureProfile(
	profile: FriendRequestSummary["sender"],
): FriendRequestSummary["sender"] {
	return {
		id: profile.id,
		email: profile.email ?? null,
		firstName: profile.firstName ?? null,
		lastName: profile.lastName ?? null,
		image: profile.image ?? null,
	};
}

function normalizeFriend(friend: Partial<FriendSummary>): FriendSummary {
	const createdAt = toISOString(friend.createdAt);

	return {
		friendshipId: friend.friendshipId ?? generateId("friend"),
		friendId: friend.friendId ?? "",
		email: friend.email ?? null,
		firstName: friend.firstName ?? null,
		lastName: friend.lastName ?? null,
		image: friend.image ?? null,
		createdAt,
		hasConversation: Boolean(friend.hasConversation),
	};
}

function normalizeRequest(
	request: Partial<FriendRequestSummary>,
): FriendRequestSummary {
	const createdAt = toISOString(request.createdAt);
	const updatedAt = request.updatedAt ? toISOString(request.updatedAt) : null;
	const respondedAt = request.respondedAt
		? toISOString(request.respondedAt)
		: null;

	const sender = request.sender
		? ensureProfile(request.sender)
		: {
				id: request.senderId ?? "",
				email: null,
				firstName: null,
				lastName: null,
				image: null,
			};

	const recipient = request.recipient
		? ensureProfile(request.recipient)
		: {
				id: request.recipientId ?? "",
				email: null,
				firstName: null,
				lastName: null,
				image: null,
			};

	return {
		id: request.id ?? generateId("request"),
		status: request.status ?? "pending",
		senderId: request.senderId ?? sender.id,
		recipientId: request.recipientId ?? recipient.id,
		createdAt,
		updatedAt,
		respondedAt,
		sender,
		recipient,
	};
}

function normalizeState(
	value: Partial<ContactsState> | null | undefined,
): ContactsState {
	const friends = Array.isArray(value?.friends)
		? value!.friends.map((friend) => normalizeFriend(friend))
		: [];

	const incoming = Array.isArray(value?.incoming)
		? value!.incoming.map((request) => normalizeRequest(request))
		: [];

	const outgoing = Array.isArray(value?.outgoing)
		? value!.outgoing.map((request) => normalizeRequest(request))
		: [];

	return {
		friends,
		incoming,
		outgoing,
		lastSyncedAt: value?.lastSyncedAt ?? null,
	};
}

function reducer(state: ContactsState, action: ContactsAction): ContactsState {
	switch (action.type) {
		case "hydrate":
		case "sync": {
			return {
				friends: action.payload.friends,
				incoming: action.payload.incoming,
				outgoing: action.payload.outgoing,
				lastSyncedAt: action.payload.lastSyncedAt ?? new Date().toISOString(),
			};
		}
		case "addFriend": {
			const exists = state.friends.some(
				(friend) =>
					friend.friendId === action.payload.friendId ||
					friend.friendshipId === action.payload.friendshipId,
			);

			if (exists) {
				return state;
			}

			return {
				...state,
				friends: [action.payload, ...state.friends],
			};
		}
		case "removeFriend": {
			return {
				...state,
				friends: state.friends.filter(
					(friend) => friend.friendshipId !== action.friendshipId,
				),
			};
		}
		case "addIncoming": {
			const next = state.incoming.filter(
				(request) => request.id !== action.payload.id,
			);
			return {
				...state,
				incoming: [action.payload, ...next],
			};
		}
		case "removeIncoming": {
			return {
				...state,
				incoming: state.incoming.filter(
					(request) => request.id !== action.requestId,
				),
			};
		}
		case "addOutgoing": {
			const next = state.outgoing.filter(
				(request) => request.id !== action.payload.id,
			);
			return {
				...state,
				outgoing: [action.payload, ...next],
			};
		}
		case "removeOutgoing": {
			return {
				...state,
				outgoing: state.outgoing.filter(
					(request) => request.id !== action.requestId,
				),
			};
		}
		default:
			return state;
	}
}

function isAbortError(error: unknown) {
	return error instanceof DOMException && error.name === "AbortError";
}

function formatTimestamp(value: string | null | undefined, locale: string) {
	if (!value) return "";
	try {
		const date = new Date(value);
		return new Intl.DateTimeFormat(locale, {
			dateStyle: "medium",
			timeStyle: "short",
		}).format(date);
	} catch {
		return value;
	}
}

export default function ContactsClient({
	cacheKey,
	viewerId,
	initialState,
}: ContactsClientProps) {
	const t = useTranslations("WorkspaceContacts");
	const [state, dispatch] = useReducer(reducer, normalizeState(initialState));
	const [hasHydrated, setHasHydrated] = useState(false);
	const [toast, setToast] = useState<string | null>(null);
	const [pendingMap, setPendingMap] = useState<Record<string, boolean>>({});
	const [isSyncing, startTransition] = useTransition();
	const locale = useLocale();

	const markPending = (id: string, pending: boolean) => {
		setPendingMap((previous) => {
			if (pending) {
				return { ...previous, [id]: true };
			}

			const next = { ...previous };
			delete next[id];
			return next;
		});
	};

	const persist = useCallback(
		(next: ContactsState) => {
			if (typeof window === "undefined") {
				return;
			}
			try {
				window.localStorage.setItem(cacheKey, JSON.stringify(next));
			} catch (error) {
				console.warn("Failed to persist contacts cache", error);
			}
		},
		[cacheKey],
	);

	const handleSync = useCallback(
		(next: Partial<ContactsState> | null | undefined) => {
			const normalized = normalizeState(next);
			dispatch({ type: "sync", payload: normalized });
			persist(normalized);
		},
		[persist],
	);

	const handleError = useCallback((message: string) => {
		setToast(message);
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			setHasHydrated(true);
			return;
		}

		try {
			const cached = window.localStorage.getItem(cacheKey);
			if (cached) {
				const parsed = JSON.parse(cached) as Partial<ContactsState>;
				dispatch({ type: "hydrate", payload: normalizeState(parsed) });
			}
		} catch (error) {
			console.warn("Failed to read contacts cache", error);
		} finally {
			setHasHydrated(true);
		}
	}, [cacheKey]);

	useEffect(() => {
		if (!hasHydrated) return;

		const controller = new AbortController();

		startTransition(async () => {
			try {
				const response = await fetch("/api/contacts", {
					method: "GET",
					signal: controller.signal,
				});

				if (!response.ok) {
					throw new Error("Failed to sync contacts");
				}

				const payload = (await response.json()) as Partial<ContactsState>;
				handleSync(payload);
			} catch (error) {
				if (!isAbortError(error)) {
					console.error(error);
					handleError(t("errors.load"));
				}
			}
		});

		return () => {
			controller.abort();
		};
	}, [hasHydrated, handleError, handleSync, t]);

	useEffect(() => {
		if (!hasHydrated) return;
		persist(state);
	}, [state, hasHydrated, persist]);

	const sendFriendRequest = async (match: ContactSearchMatch) => {
		const optimisticId = `outgoing-${match.id}-${Date.now()}`;
		const optimisticRequest: FriendRequestSummary = normalizeRequest({
			id: optimisticId,
			senderId: viewerId,
			recipientId: match.id,
			sender: {
				id: viewerId,
				email: null,
				firstName: null,
				lastName: null,
				image: null,
			},
			recipient: {
				id: match.id,
				email: match.email ?? null,
				firstName: match.firstName ?? null,
				lastName: match.lastName ?? null,
				image: match.image ?? null,
			},
		});

		dispatch({ type: "addOutgoing", payload: optimisticRequest });
		markPending(optimisticId, true);

		return new Promise<boolean>((resolve) => {
			startTransition(async () => {
				try {
					const response = await fetch("/api/friend-requests", {
						method: "POST",
						headers: {
							"Content-Type": "application/json",
						},
						body: JSON.stringify({ recipientId: match.id }),
					});

					if (!response.ok) {
						const errorPayload = (await response.json().catch(() => ({}))) as {
							error?: string;
						};
						throw new Error(
							errorPayload.error ?? "Unable to create friend request",
						);
					}

					const payload = (await response.json()) as Partial<ContactsState>;
					handleSync(payload);
					resolve(true);
				} catch (error) {
					console.error(error);
					dispatch({ type: "removeOutgoing", requestId: optimisticId });
					handleError(
						error instanceof Error ? error.message : t("errors.request"),
					);
					resolve(false);
				} finally {
					markPending(optimisticId, false);
				}
			});
		});
	};

	const acceptRequest = (request: FriendRequestSummary) => {
		const optimisticFriend: FriendSummary = normalizeFriend({
			friendshipId: `friend-${request.id}`,
			friendId: request.senderId,
			email: request.sender.email,
			firstName: request.sender.firstName,
			lastName: request.sender.lastName,
			image: request.sender.image,
		});

		dispatch({ type: "removeIncoming", requestId: request.id });
		dispatch({ type: "addFriend", payload: optimisticFriend });
		markPending(request.id, true);

		startTransition(async () => {
			try {
				const response = await fetch(
					`/api/friend-requests/${request.id}/accept`,
					{
						method: "POST",
					},
				);

				if (!response.ok) {
					const errorPayload = (await response.json().catch(() => ({}))) as {
						error?: string;
					};
					throw new Error(
						errorPayload.error ?? "Unable to accept friend request",
					);
				}

				const payload = (await response.json()) as Partial<ContactsState>;
				handleSync(payload);
			} catch (error) {
				console.error(error);
				dispatch({ type: "addIncoming", payload: request });
				dispatch({
					type: "removeFriend",
					friendshipId: optimisticFriend.friendshipId,
				});
				handleError(
					error instanceof Error ? error.message : t("errors.request"),
				);
			} finally {
				markPending(request.id, false);
			}
		});
	};

	const declineRequest = (request: FriendRequestSummary) => {
		dispatch({ type: "removeIncoming", requestId: request.id });
		markPending(request.id, true);

		startTransition(async () => {
			try {
				const response = await fetch(
					`/api/friend-requests/${request.id}/decline`,
					{
						method: "POST",
					},
				);

				if (!response.ok) {
					const errorPayload = (await response.json().catch(() => ({}))) as {
						error?: string;
					};
					throw new Error(
						errorPayload.error ?? "Unable to decline friend request",
					);
				}

				const payload = (await response.json()) as Partial<ContactsState>;
				handleSync(payload);
			} catch (error) {
				console.error(error);
				dispatch({ type: "addIncoming", payload: request });
				handleError(
					error instanceof Error ? error.message : t("errors.request"),
				);
			} finally {
				markPending(request.id, false);
			}
		});
	};

	const cancelRequest = (request: FriendRequestSummary) => {
		dispatch({ type: "removeOutgoing", requestId: request.id });
		markPending(request.id, true);

		startTransition(async () => {
			try {
				const response = await fetch(
					`/api/friend-requests/${request.id}/cancel`,
					{
						method: "POST",
					},
				);

				if (!response.ok) {
					const errorPayload = (await response.json().catch(() => ({}))) as {
						error?: string;
					};
					throw new Error(
						errorPayload.error ?? "Unable to cancel friend request",
					);
				}

				const payload = (await response.json()) as Partial<ContactsState>;
				handleSync(payload);
			} catch (error) {
				console.error(error);
				dispatch({ type: "addOutgoing", payload: request });
				handleError(
					error instanceof Error ? error.message : t("errors.request"),
				);
			} finally {
				markPending(request.id, false);
			}
		});
	};

	const removeFriend = (friend: FriendSummary) => {
		dispatch({ type: "removeFriend", friendshipId: friend.friendshipId });
		markPending(friend.friendshipId, true);

		startTransition(async () => {
			try {
				const response = await fetch(
					`/api/friends/${encodeURIComponent(friend.friendId)}`,
					{
						method: "DELETE",
					},
				);

				if (!response.ok) {
					const errorPayload = (await response.json().catch(() => ({}))) as {
						error?: string;
					};
					throw new Error(errorPayload.error ?? "Unable to remove friend");
				}

				const payload = (await response.json()) as Partial<ContactsState>;
				handleSync(payload);
			} catch (error) {
				console.error(error);
				dispatch({ type: "addFriend", payload: friend });
				handleError(
					error instanceof Error ? error.message : t("errors.removeFriend"),
				);
			} finally {
				markPending(friend.friendshipId, false);
			}
		});
	};

	const pendingIds = useMemo(
		() => new Set(Object.keys(pendingMap)),
		[pendingMap],
	);

	const lastSynced = useMemo(
		() => formatTimestamp(state.lastSyncedAt ?? null, locale),
		[locale, state.lastSyncedAt],
	);

	return (
		<div className="mx-auto flex w-full max-w-5xl flex-col space-y-6 px-4 py-8 sm:px-6 lg:px-0">
			<header className="space-y-2">
				<p className="text-xs uppercase tracking-[0.35em] text-white/40">
					{t("title")}
				</p>
				<h1 className="text-3xl font-semibold text-white">{t("headline")}</h1>
				<p className="max-w-2xl text-sm text-white/60">{t("description")}</p>
				{lastSynced ? (
					<p className="text-xs text-white/40">
						{t("lastSynced", { timestamp: lastSynced })}
					</p>
				) : null}
			</header>

			{toast ? (
				<div className="flex items-center justify-between rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
					<span>{toast}</span>
					<button
						type="button"
						onClick={() => setToast(null)}
						className="rounded-full border border-red-500/40 px-3 py-1 text-xs uppercase tracking-[0.25em] text-red-200 transition hover:border-red-300 hover:text-red-100"
					>
						{t("toast.dismiss")}
					</button>
				</div>
			) : null}

			<div className="grid gap-6 lg:grid-cols-[2fr,1fr] xl:grid-cols-[3fr,1.2fr]">
				<section className="space-y-6">
					<FriendList
						friends={state.friends}
						isSyncing={isSyncing}
						title={t("lists.friends.title")}
						emptyLabel={t("lists.friends.empty")}
						countLabel={t("lists.friends.count", {
							count: state.friends.length,
						})}
						syncingLabel={t("lists.friends.syncing")}
						formatSinceLabel={(value) =>
							t("lists.friends.since", { timestamp: value })
						}
						onRemove={removeFriend}
						pendingIds={pendingIds}
						removeLabel={t("actions.remove")}
						removingLabel={t("actions.removing")}
					/>
					<div className="grid gap-6 lg:grid-cols-2">
						<FriendRequestList
							title={t("lists.incoming.title")}
							emptyLabel={t("lists.incoming.empty")}
							actionLabel={t("actions.accept")}
							secondaryActionLabel={t("actions.decline")}
							badgeLabel={t("lists.incoming.badge")}
							formatTimestampLabel={(value) =>
								t("lists.requests.timestamp", { timestamp: value })
							}
							requests={state.incoming}
							type="incoming"
							pendingIds={pendingIds}
							onPrimaryAction={acceptRequest}
							onSecondaryAction={declineRequest}
						/>
						<FriendRequestList
							title={t("lists.outgoing.title")}
							emptyLabel={t("lists.outgoing.empty")}
							actionLabel={t("actions.cancel")}
							badgeLabel={t("lists.outgoing.badge")}
							formatTimestampLabel={(value) =>
								t("lists.requests.timestamp", { timestamp: value })
							}
							requests={state.outgoing}
							type="outgoing"
							pendingIds={pendingIds}
							onPrimaryAction={cancelRequest}
						/>
					</div>
				</section>
				<aside>
					<ContactSearch
						friends={state.friends}
						incoming={state.incoming}
						outgoing={state.outgoing}
						onSync={handleSync}
						onSendRequest={sendFriendRequest}
						onError={handleError}
					/>
				</aside>
			</div>
		</div>
	);
}
