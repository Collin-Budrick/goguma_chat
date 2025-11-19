"use client";

import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";

import {
	type PeerSignalingController,
	type PeerSignalingRole,
	type PeerSignalingSnapshot,
	peerSignalingController,
} from "@/lib/messaging-transport";

const logPeerSignaling = (message: string, meta?: unknown) => {
	if (typeof console === "undefined" || typeof console.info !== "function") {
		return;
	}
	if (meta !== undefined) {
		console.info(`[peer-signaling] ${message}`, meta);
		return;
	}
	console.info(`[peer-signaling] ${message}`);
};

export type PeerSignalingStatus =
	| "idle"
	| "hosting"
	| "awaiting-answer"
	| "awaiting-invite"
	| "answering"
	| "ready"
	| "connected"
	| "error";

const deriveStatus = (snapshot: PeerSignalingSnapshot): PeerSignalingStatus => {
	if (snapshot.error) return "error";
	if (snapshot.connected) return "connected";

	if (snapshot.role === "host") {
		if (!snapshot.localInvite) return "hosting";
		if (snapshot.awaitingAnswer) return "awaiting-answer";
		if (snapshot.remoteAnswer) return "ready";
		return "hosting";
	}

	if (snapshot.role === "guest") {
		if (snapshot.awaitingOffer) return "awaiting-invite";
		if (!snapshot.localAnswer) return "answering";
		return "ready";
	}

	return "idle";
};

const sequenceExpiration = (
	controller: PeerSignalingController,
	expires: { inviteExpiresAt: number | null; answerExpiresAt: number | null },
) => {
	if (typeof window === "undefined") {
		return () => undefined;
	}

	const timers: number[] = [];
	const now = Date.now();

	if (expires.inviteExpiresAt) {
		const remaining = expires.inviteExpiresAt - now;
		if (remaining <= 0) {
			controller.expireLocalInvite();
		} else {
			timers.push(
				window.setTimeout(() => controller.expireLocalInvite(), remaining),
			);
		}
	}

	if (expires.answerExpiresAt) {
		const remaining = expires.answerExpiresAt - now;
		if (remaining <= 0) {
			controller.expireLocalAnswer();
		} else {
			timers.push(
				window.setTimeout(() => controller.expireLocalAnswer(), remaining),
			);
		}
	}

		return () => {
			timers.forEach((timer) => {
				window.clearTimeout(timer);
			});
		};
};

type PeerSignalingOptions = {
	conversationId?: string | null;
	viewerId?: string | null;
	enabled?: boolean;
};

type RemoteTokenPayload = {
	token: string;
	kind: "offer" | "answer";
	fromRole: PeerSignalingRole;
	sessionId: string;
	createdAt: number;
};

const POLL_INTERVAL_MS = 3_000;
const COUNTDOWN_INTERVAL_MS = 1_000;

const scheduleMicrotask =
	typeof queueMicrotask === "function"
		? queueMicrotask
		: (callback: () => void) => {
				Promise.resolve()
					.then(callback)
					.catch(() => undefined);
			};

function useRemainingTime(target: number | null) {
	const [remaining, setRemaining] = useState<number | null>(null);

	useEffect(() => {
		if (typeof window === "undefined" || target == null) {
			scheduleMicrotask(() => setRemaining(null));
			return () => undefined;
		}

		const update = () => setRemaining(Math.max(0, target - Date.now()));
		update();
		const timer = window.setInterval(update, COUNTDOWN_INTERVAL_MS);

		return () => {
			window.clearInterval(timer);
		};
	}, [target]);

	return remaining;
}

export const deriveShouldInitializeTransport = (
	controllerReady: boolean,
	snapshot: PeerSignalingSnapshot,
) => {
	if (!controllerReady) {
		return false;
	}

	if (snapshot.role === "guest") {
		return Boolean(snapshot.remoteInvite);
	}

	return Boolean(snapshot.role);
};

export function usePeerSignaling(options?: PeerSignalingOptions) {
	const conversationId = options?.conversationId ?? null;
	const viewerId = options?.viewerId ?? null;
	const enabled = options?.enabled ?? true;
	const controller = peerSignalingController;
	const snapshot = useSyncExternalStore(
		(listener) => controller.subscribe(listener),
		() => controller.getSnapshot(),
		() => controller.getSnapshot(),
	);
	const status: PeerSignalingStatus = useMemo(
		() => (enabled ? deriveStatus(snapshot) : "idle"),
		[enabled, snapshot],
	);

	const publishedTokensRef = useRef<{
		offer: string | null;
		answer: string | null;
	}>({
		offer: null,
		answer: null,
	});
	const publishStateRef = useRef<
		Record<
			"offer" | "answer",
			{
				pending: string | null;
				attempts: number;
				inFlight: boolean;
				blocked: boolean;
			}
		>
	>({
		offer: { pending: null, attempts: 0, inFlight: false, blocked: false },
		answer: { pending: null, attempts: 0, inFlight: false, blocked: false },
	});
	const retryTimeoutRef = useRef<Record<"offer" | "answer", number | null>>({
		offer: null,
		answer: null,
	});
	const lastConnectedRef = useRef<boolean>(snapshot.connected);
	const remoteTokensRef = useRef<Set<string>>(new Set());

	const resetPublishState = useCallback(() => {
		["offer", "answer"].forEach((kind) => {
			const key = kind as "offer" | "answer";
			const timer = retryTimeoutRef.current[key];
			if (timer && typeof window !== "undefined") {
				window.clearTimeout(timer);
			}
			retryTimeoutRef.current[key] = null;
			publishStateRef.current[key] = {
				pending: null,
				attempts: 0,
				inFlight: false,
				blocked: false,
			};
			publishedTokensRef.current[key] = null;
		});
	}, []);

	useEffect(() => {
		resetPublishState();
	}, [resetPublishState]);

	useEffect(() => {
		remoteTokensRef.current.clear();
	}, []);

	useEffect(() => {
		if (snapshot.remoteAnswer) {
			resetPublishState();
		}
	}, [resetPublishState, snapshot.remoteAnswer]);

	useEffect(() => {
		if (snapshot.connected && !lastConnectedRef.current) {
			resetPublishState();
		}
		lastConnectedRef.current = snapshot.connected;
	}, [resetPublishState, snapshot.connected]);

	useEffect(() => {
		if (!enabled || typeof window === "undefined") {
			return;
		}

		if (!conversationId || !viewerId || !snapshot.role) {
			return;
		}

		const MAX_PUBLISH_ATTEMPTS = 3;
		const BASE_RETRY_DELAY_MS = 1_000;

		const clearRetry = (kind: "offer" | "answer") => {
			const timer = retryTimeoutRef.current[kind];
			if (timer && typeof window !== "undefined") {
				window.clearTimeout(timer);
			}
			retryTimeoutRef.current[kind] = null;
		};

		const markBlocked = (kind: "offer" | "answer") => {
			publishStateRef.current[kind].blocked = true;
		};

		const publishToken = async (kind: "offer" | "answer", token: string) => {
			logPeerSignaling("publishing peer signaling token", {
				conversationId,
				kind,
				role: snapshot.role,
				sessionId: snapshot.sessionId,
				attempt: publishStateRef.current[kind].attempts,
			});

			const response = await fetch(`/api/peer-signaling/${conversationId}`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					viewerId,
					sessionId: snapshot.sessionId,
					role: snapshot.role,
					kind,
					token,
				}),
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					error?: string;
				} | null;
				const message = payload?.error ?? "unknown error";
				logPeerSignaling("failed to publish peer signaling token", {
					kind,
					status: response.status,
					error: message,
				});
				throw new Error(message);
			}

			logPeerSignaling("published peer signaling token", { kind });
		};

		const startPublish = (kind: "offer" | "answer") => {
			const state = publishStateRef.current[kind];
			const token = state.pending;
			if (!token) return;

			clearRetry(kind);
			state.inFlight = true;
			state.attempts += 1;

			publishToken(kind, token)
				.then(() => {
					state.inFlight = false;
					state.blocked = false;
					state.pending = null;
					state.attempts = 0;
					publishedTokensRef.current[kind] = token;
				})
				.catch((error) => {
					state.inFlight = false;
					markBlocked(kind);
					console.error("Failed to publish peer signaling token", error);

					if (state.attempts >= MAX_PUBLISH_ATTEMPTS) {
						logPeerSignaling(
							"publish attempts exhausted; waiting for reconnect",
							{
								kind,
								attempts: state.attempts,
								sessionId: snapshot.sessionId,
							},
						);
						return;
					}

					const delay = Math.min(BASE_RETRY_DELAY_MS * state.attempts, 10_000);
					logPeerSignaling("scheduling peer signaling publish retry", {
						kind,
						attempts: state.attempts,
						delay,
					});

					if (typeof window === "undefined") {
						return;
					}

					retryTimeoutRef.current[kind] = window.setTimeout(() => {
						startPublish(kind);
					}, delay);
				});
		};

		const ensurePublished = (
			kind: "offer" | "answer",
			value: string | null,
		) => {
			if (!value) return;
			if (snapshot.remoteAnswer) {
				logPeerSignaling(
					"skipping publish because remote answer already exists",
					{
						kind,
						sessionId: snapshot.sessionId,
					},
				);
				return;
			}

			const hasError = Boolean(snapshot.error);
			const recoveringFromDisconnect =
				lastConnectedRef.current && !snapshot.connected;
			if (hasError || recoveringFromDisconnect) {
				logPeerSignaling("skipping publish while controller is recovering", {
					kind,
					sessionId: snapshot.sessionId,
					hasError,
					recoveringFromDisconnect,
				});
				return;
			}

			const state = publishStateRef.current[kind];
			const alreadyPublished = publishedTokensRef.current[kind] === value;
			const currentToken = state.pending ?? publishedTokensRef.current[kind];
			const tokenChanged = currentToken !== value;

			if (alreadyPublished) {
				return;
			}

			if (tokenChanged) {
				state.pending = value;
				state.blocked = false;
				state.attempts = 0;
			}

			if (state.inFlight) {
				logPeerSignaling(
					"skipping publish because a previous attempt is in flight",
					{
						kind,
						sessionId: snapshot.sessionId,
					},
				);
				return;
			}

			if (state.blocked && !tokenChanged) {
				logPeerSignaling("skipping publish because previous attempts failed", {
					kind,
					sessionId: snapshot.sessionId,
				});
				return;
			}

			if (!tokenChanged && state.attempts >= MAX_PUBLISH_ATTEMPTS) {
				logPeerSignaling("skipping publish because attempts are exhausted", {
					kind,
					attempts: state.attempts,
					sessionId: snapshot.sessionId,
				});
				markBlocked(kind);
				return;
			}

			startPublish(kind);
		};

		ensurePublished("offer", snapshot.localOfferToken);
		ensurePublished("answer", snapshot.localAnswerToken);

		if (!snapshot.localOfferToken) {
			publishedTokensRef.current.offer = null;
		}

		if (!snapshot.localAnswerToken) {
			publishedTokensRef.current.answer = null;
		}

		return () => {
			clearRetry("offer");
			clearRetry("answer");
		};
	}, [
		conversationId,
		enabled,
		snapshot.connected,
		snapshot.error,
		snapshot.localAnswerToken,
		snapshot.localOfferToken,
		snapshot.remoteAnswer,
		snapshot.role,
		snapshot.sessionId,
		viewerId,
	]);

	useEffect(() => {
		if (!enabled || typeof window === "undefined") {
			return;
		}

		if (!conversationId || !viewerId || !snapshot.role) {
			return;
		}

		const handlePayload = (payload: RemoteTokenPayload) => {
			if (!payload?.token) {
				return;
			}
			const key = `${payload.kind}:${payload.token}`;
			if (remoteTokensRef.current.has(key)) {
				return;
			}
			remoteTokensRef.current.add(key);

			if (payload.kind === "offer") {
				void controller.setRemoteInvite(payload.token).catch((error) => {
					console.error("Failed to apply remote invite token", error);
				});
			} else if (payload.kind === "answer") {
				void controller.setRemoteAnswer(payload.token).catch((error) => {
					console.error("Failed to apply remote answer token", error);
				});
			}
		};

		const params = new URLSearchParams({
			role: snapshot.role,
			viewerId,
		});
		if (snapshot.sessionId) {
			params.set("sessionId", snapshot.sessionId);
		}
		const baseUrl = `/api/peer-signaling/${conversationId}?${params.toString()}`;

		logPeerSignaling("subscribing to remote peer tokens", {
			role: snapshot.role,
			mode: typeof window.EventSource === "function" ? "sse" : "poll",
			baseUrl,
			viewerId,
			sessionId: snapshot.sessionId,
		});

		if (typeof window.EventSource === "function") {
			const source = new window.EventSource(baseUrl);
			const handleOpen = () => {
				logPeerSignaling("remote token EventSource opened", { baseUrl });
			};
			const handleError = (event: Event) => {
				logPeerSignaling("remote token EventSource error", {
					baseUrl,
					eventType: event.type,
				});
			};
			const tokenListener = (event: MessageEvent) => {
				try {
					const payload = JSON.parse(event.data ?? "{}") as RemoteTokenPayload;
					logPeerSignaling("received remote peer token", {
						kind: payload.kind,
						fromRole: payload.fromRole,
						sessionId: payload.sessionId,
						createdAt: payload.createdAt,
						baseUrl,
					});
					handlePayload(payload);
				} catch (error) {
					console.error("Failed to parse remote signaling token", error);
				}
			};

			source.addEventListener("open", handleOpen);
			source.addEventListener("error", handleError);
			source.addEventListener("token", tokenListener as EventListener);

			return () => {
				logPeerSignaling("closing remote token EventSource", { baseUrl });
				source.removeEventListener("token", tokenListener as EventListener);
				source.removeEventListener("open", handleOpen);
				source.removeEventListener("error", handleError);
				source.close();
			};
		}

		const abortController = new AbortController();

		logPeerSignaling("polling remote peer tokens", { baseUrl });
		const poll = async () => {
			while (!abortController.signal.aborted) {
				try {
					const response = await fetch(`${baseUrl}&mode=poll`, {
						signal: abortController.signal,
					});
					if (response.ok) {
						const payload = (await response.json()) as {
							tokens?: RemoteTokenPayload[];
						};
						logPeerSignaling("polled remote peer tokens", {
							baseUrl,
							count: payload.tokens?.length ?? 0,
						});
						payload.tokens?.forEach((token) => {
							handlePayload(token);
						});
					}
				} catch (error) {
					if (!abortController.signal.aborted) {
						logPeerSignaling("failed to poll remote peer tokens", {
							baseUrl,
							error,
						});
						console.error("Failed to poll peer signaling tokens", error);
					}
				}

				await new Promise((resolve) => {
					setTimeout(resolve, POLL_INTERVAL_MS);
				});
			}
		};

		void poll();

		return () => {
			abortController.abort();
		};
	}, [
		conversationId,
		controller,
		enabled,
		snapshot.role,
		snapshot.sessionId,
		viewerId,
	]);

	const { inviteExpiresAt, answerExpiresAt } = snapshot;

	useEffect(
		() =>
			enabled
				? sequenceExpiration(controller, {
						inviteExpiresAt,
						answerExpiresAt,
					})
				: () => undefined,
		[controller, enabled, inviteExpiresAt, answerExpiresAt],
	);

	const dependencies = useMemo(
		() => controller.createDependencies(),
		[controller],
	);

	const selectRole = useCallback(
		(role: PeerSignalingRole) => {
			controller.setRole(role);
		},
		[controller],
	);

	const reset = useCallback(() => {
		controller.clear();
	}, [controller]);

	const exit = useCallback(() => {
		controller.setRole(null);
	}, [controller]);

	const applyRemoteInvite = useCallback(
		async (token: string) => {
			await controller.setRemoteInvite(token);
		},
		[controller],
	);

	const applyRemoteAnswer = useCallback(
		async (token: string) => {
			await controller.setRemoteAnswer(token);
		},
		[controller],
	);

	const shouldInitialize = useMemo(
		() =>
			enabled &&
			deriveShouldInitializeTransport(controller.shouldInitialize(), snapshot),
		[controller, enabled, snapshot],
	);

	const inviteExpiresIn = useRemainingTime(
		enabled ? snapshot.inviteExpiresAt : null,
	);
	const answerExpiresIn = useRemainingTime(
		enabled ? snapshot.answerExpiresAt : null,
	);

	return {
		controller,
		snapshot,
		status,
		dependencies,
		selectRole,
		reset,
		exit,
		applyRemoteInvite,
		applyRemoteAnswer,
		shouldInitialize,
		inviteExpiresIn,
		answerExpiresIn,
	} as const;
}
