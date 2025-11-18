"use client";

import { useEffect, useMemo, useState } from "react";

import {
	getPeerTrustState,
	markPeerTrusted,
	subscribePeerTrust,
	type PeerTrustState,
} from "@/lib/crypto/session";

const emptyState: PeerTrustState = {
	sessionId: "",
	localFingerprint: null,
	remoteFingerprint: null,
	trusted: false,
	lastRotation: null,
};

const scheduleMicrotask =
	typeof queueMicrotask === "function"
		? queueMicrotask
		: (callback: () => void) => {
				Promise.resolve()
					.then(callback)
					.catch(() => undefined);
			};

export function usePeerTrust(sessionId: string | null) {
	const [state, setState] = useState<PeerTrustState>(emptyState);
	const [loading, setLoading] = useState<boolean>(() => Boolean(sessionId));

	useEffect(() => {
		let cancelled = false;
		if (!sessionId) {
			scheduleMicrotask(() => {
				setState(emptyState);
				setLoading(false);
			});
			return () => undefined;
		}

		scheduleMicrotask(() => {
			setLoading(true);
		});

		void getPeerTrustState(sessionId)
			.then((snapshot) => {
				if (!cancelled) {
					setState(snapshot);
					setLoading(false);
				}
			})
			.catch((error) => {
				console.error("Failed to load peer trust state", error);
				if (!cancelled) {
					setState(emptyState);
					setLoading(false);
				}
			});

		const unsubscribe = subscribePeerTrust((next) => {
			if (next.sessionId === sessionId) {
				setState(next);
			}
		});

		return () => {
			cancelled = true;
			unsubscribe();
		};
	}, [sessionId]);

	const actions = useMemo(
		() => ({
			async trust() {
				if (!sessionId) return;
				await markPeerTrusted(sessionId, true);
			},
			async distrust() {
				if (!sessionId) return;
				await markPeerTrusted(sessionId, false);
			},
		}),
		[sessionId],
	);

	const effectiveState = sessionId ? state : emptyState;
	const effectiveLoading = sessionId ? loading : false;

	return {
		state: effectiveState,
		loading: effectiveLoading,
		...actions,
	} as const;
}
