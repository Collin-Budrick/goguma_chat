"use client";

import { useEffect } from "react";

const PEER_SYNC_TAG = "peer-channel-flush";
const PEER_PERIODIC_TAG = "peer-channel-refresh";

const SERVICE_WORKER_PATH = "/sw.js";

type ServiceWorkerSyncManager = {
	register(tag: string): Promise<void>;
};

type PeriodicSyncManager = {
	register(
		tag: string,
		options?: {
			minInterval?: number;
		},
	): Promise<void>;
};

export function ServiceWorkerClient() {
	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		if (!("serviceWorker" in navigator)) {
			console.info("[sw] Service workers are not supported in this browser.");
			return;
		}

		if (
			process.env.NODE_ENV === "development" &&
			window.location.hostname === "localhost"
		) {
			console.info(
				"[sw] Skipping service worker registration in local development.",
			);
			return;
		}

		let isMounted = true;

		const applyAppBadge = async (count: number) => {
			const nav = navigator as Navigator & {
				setAppBadge?: (count?: number) => Promise<void>;
				clearAppBadge?: () => Promise<void>;
			};

			if (typeof nav.setAppBadge !== "function") {
				return;
			}

			try {
				if (count > 0) {
					await nav.setAppBadge(count);
				} else if (typeof nav.clearAppBadge === "function") {
					await nav.clearAppBadge();
				} else {
					await nav.setAppBadge();
				}
			} catch (error) {
				console.warn("[sw] Failed to update app badge", error);
			}
		};

		const handleBadgeBroadcast = (event: Event) => {
			const detail = (event as CustomEvent<{ count?: number }>).detail;
			if (!detail) return;
			void applyAppBadge(
				Number.isFinite(detail.count) ? Number(detail.count) : 0,
			);
		};

		window.addEventListener(
			"peer-badge-count",
			handleBadgeBroadcast as EventListener,
		);

		const handleServiceWorkerMessage = (event: MessageEvent) => {
			const payload = event.data;
			if (!payload || typeof payload !== "object") {
				return;
			}

			if (payload.type === "peer:badge-count") {
				const count = Number(payload.count) || 0;
				void applyAppBadge(count);
			}
		};

		navigator.serviceWorker.addEventListener(
			"message",
			handleServiceWorkerMessage,
		);

		type BackgroundSyncRegistration = ServiceWorkerRegistration & {
			sync?: ServiceWorkerSyncManager;
			periodicSync?: PeriodicSyncManager;
		};

		const ensureBackgroundCapabilities = async (
			registration: BackgroundSyncRegistration,
		) => {
			const permissions = (
				navigator as Navigator & {
					permissions?: {
						query(options: PermissionDescriptor): Promise<PermissionStatus>;
					};
				}
			).permissions;

			const queryPermission = async (name: PermissionName) => {
				if (!permissions) return;
				try {
					const status = await permissions.query({ name });
					console.info(`[sw] Permission '${name}' status:`, status.state);
				} catch {
					// ignore unsupported permissions
				}
			};

			await queryPermission("notifications");
			await queryPermission("periodic-background-sync" as PermissionName);

			const syncManager = registration.sync;
			if (syncManager) {
				try {
					await syncManager.register(PEER_SYNC_TAG);
				} catch (error) {
					console.info("[sw] Background sync unavailable", error);
				}
			}

			const periodicSyncManager = registration.periodicSync;
			if (periodicSyncManager) {
				try {
					await periodicSyncManager.register(PEER_PERIODIC_TAG, {
						minInterval: 15 * 60 * 1000,
					});
				} catch (error) {
					const name =
						typeof error === "object" && error !== null && "name" in error
							? (error as { name?: string }).name
							: undefined;
					if (name !== "NotAllowedError") {
						console.info("[sw] Periodic sync unavailable", error);
					}
				}
			}

			if (
				typeof Notification !== "undefined" &&
				Notification.permission === "default"
			) {
				console.info("[sw] Notifications permission has not been granted yet.");
			}
		};

		navigator.serviceWorker
			.register(SERVICE_WORKER_PATH)
			.then((registration) => {
				if (!isMounted) {
					return;
				}

				console.info("[sw] Service worker registered", registration.scope);

				registration.addEventListener("updatefound", () => {
					const installingWorker = registration.installing;
					if (installingWorker) {
						installingWorker.addEventListener("statechange", () => {
							if (installingWorker.state === "installed") {
								if (navigator.serviceWorker.controller) {
									console.info(
										"[sw] New content is available; refresh for the latest version.",
									);
								} else {
									console.info("[sw] Content is cached for offline use.");
								}
							}
						});
					}
				});

				void ensureBackgroundCapabilities(registration);
			})
			.catch((error) => {
				if (isMounted) {
					console.error("[sw] Service worker registration failed", error);
				}
			});

		return () => {
			isMounted = false;
			window.removeEventListener(
				"peer-badge-count",
				handleBadgeBroadcast as EventListener,
			);
			navigator.serviceWorker.removeEventListener(
				"message",
				handleServiceWorkerMessage,
			);
		};
	}, []);

	return null;
}
