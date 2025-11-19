const CACHE_VERSION = "v3";
const APP_SHELL_CACHE = `app-shell-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const APP_SHELL_ASSETS = ["/", "/en", "/ko", "/favicon.ico"];

const UNREAD_DB_NAME = "goguma-peer-unread";
const UNREAD_STORE_NAME = "messages";
const UNREAD_DB_VERSION = 1;
const UNREAD_DELIVERED_INDEX = "delivered";
const UNREAD_CONVERSATION_INDEX = "conversationId";

const PEER_SYNC_TAG = "peer-channel-flush";
const PEER_PERIODIC_TAG = "peer-channel-refresh";
const PEER_NOTIFICATION_ICON = "/icons/icon-512x512.png";
const PEER_NOTIFICATION_BADGE = "/icons/icon-192x192.png";

let unreadDbPromise = null;

self.addEventListener("install", (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(APP_SHELL_CACHE);
			await Promise.all(
				APP_SHELL_ASSETS.map(async (asset) => {
					try {
						const request = new Request(asset, { cache: "reload" });
						const response = await fetch(request);
						if (response.ok) {
							await cache.put(request, response.clone());
						}
					} catch (error) {
						console.warn("[sw] Failed to precache", asset, error);
					}
				}),
			);
			await self.skipWaiting();
		})(),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(
				keys
					.filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE].includes(key))
					.map((key) => caches.delete(key)),
			);
			await self.clients.claim();
		})(),
	);
});

const cacheFirst = async (request, cacheName) => {
	const cache = await caches.open(cacheName);
	const cached = await cache.match(request, { ignoreVary: true });
	if (cached) {
		return cached;
	}

	try {
		const response = await fetch(request);
		if (response?.ok) {
			await cache.put(request, response.clone());
		}
		return response;
	} catch (error) {
		const fallback = await cache.match(request, { ignoreVary: true });
		if (fallback) {
			return fallback;
		}
		throw error;
	}
};

self.addEventListener("fetch", (event) => {
	const { request } = event;

	if (request.method !== "GET") {
		return;
	}

	const url = new URL(request.url);

	if (request.mode === "navigate") {
		event.respondWith(
			(async () => {
				const cache = await caches.open(APP_SHELL_CACHE);
				const cached = await cache.match(request, { ignoreVary: true });
				if (cached) {
					return cached;
				}

				try {
					const networkResponse = await fetch(request);
					if (networkResponse?.ok) {
						await cache.put(request, networkResponse.clone());
					}
					return networkResponse;
				} catch (error) {
					const fallback = await cache.match("/", { ignoreVary: true });
					if (fallback) {
						return fallback;
					}
					throw error;
				}
			})(),
		);
		return;
	}

	const isSameOrigin = url.origin === self.location.origin;

	if (
		isSameOrigin &&
		(url.pathname.startsWith("/api/") ||
			request.headers.get("accept") === "text/event-stream")
	) {
		return;
	}
	const isStaticAsset =
		isSameOrigin &&
		(url.pathname.startsWith("/_next/static/") ||
			APP_SHELL_ASSETS.includes(url.pathname) ||
			["style", "script", "font", "image"].includes(request.destination));

	if (isStaticAsset) {
		event.respondWith(cacheFirst(request, APP_SHELL_CACHE));
		return;
	}

	if (isSameOrigin) {
		event.respondWith(cacheFirst(request, RUNTIME_CACHE));
	}
});

const openUnreadDatabase = () =>
	new Promise((resolve, reject) => {
		if (typeof indexedDB === "undefined") {
			resolve(null);
			return;
		}

		const request = indexedDB.open(UNREAD_DB_NAME, UNREAD_DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(UNREAD_STORE_NAME)) {
				const store = db.createObjectStore(UNREAD_STORE_NAME, {
					keyPath: "id",
				});
				store.createIndex(UNREAD_CONVERSATION_INDEX, "conversationId", {
					unique: false,
				});
				store.createIndex(UNREAD_DELIVERED_INDEX, "delivered", {
					unique: false,
				});
			} else {
				const store = request.transaction.objectStore(UNREAD_STORE_NAME);
				if (!store.indexNames.contains(UNREAD_CONVERSATION_INDEX)) {
					store.createIndex(UNREAD_CONVERSATION_INDEX, "conversationId", {
						unique: false,
					});
				}
				if (!store.indexNames.contains(UNREAD_DELIVERED_INDEX)) {
					store.createIndex(UNREAD_DELIVERED_INDEX, "delivered", {
						unique: false,
					});
				}
			}
		};

		request.onsuccess = () => {
			const db = request.result;
			db.onversionchange = () => {
				db.close();
				unreadDbPromise = null;
			};
			resolve(db);
		};

		request.onerror = () => {
			reject(
				request.error ?? new Error("Failed to open unread message storage"),
			);
		};
	});

const getUnreadDatabase = async () => {
	if (!unreadDbPromise) {
		unreadDbPromise = openUnreadDatabase().catch((error) => {
			console.warn("[sw] Failed to initialize unread message storage", error);
			return null;
		});
	}
	return (await unreadDbPromise) ?? null;
};

const runStoreRequest = (db, mode, executor) =>
	new Promise((resolve, reject) => {
		if (!db) {
			resolve(null);
			return;
		}

		const tx = db.transaction(UNREAD_STORE_NAME, mode);
		const store = tx.objectStore(UNREAD_STORE_NAME);

		let result;
		try {
			result = executor(store, tx);
		} catch (error) {
			reject(error);
			return;
		}

		tx.oncomplete = () => {
			if (!result) {
				resolve(null);
				return;
			}
			if (typeof result === "object" && result !== null && "result" in result) {
				try {
					resolve(result.result ?? null);
				} catch (error) {
					reject(error);
				}
				return;
			}
			resolve(result ?? null);
		};
		tx.onabort = () =>
			reject(tx.error ?? new Error("Unread message transaction aborted"));
		tx.onerror = () =>
			reject(tx.error ?? new Error("Unread message transaction failed"));
	});

const getUnreadRecordById = async (id) => {
	if (!id) return null;

	const db = await getUnreadDatabase();
	if (!db) return null;

	const record = await runStoreRequest(db, "readonly", (store) =>
		store.get(id),
	).catch((error) => {
		console.warn("[sw] Failed to lookup unread message", error);
		return null;
	});

	return record && typeof record === "object" ? record : null;
};

const putUnreadRecord = async (record) => {
	const db = await getUnreadDatabase();
	if (!db) return false;

	const existing = await getUnreadRecordById(record.id);
	if (existing) return false;

	await runStoreRequest(db, "readwrite", (store) => {
		store.put(record);
	}).catch((error) => {
		console.warn("[sw] Failed to persist unread message", error);
	});

	return true;
};

const markMessagesDelivered = async (ids) => {
	if (!ids.length) return;
	const db = await getUnreadDatabase();
	if (!db) return;

	await runStoreRequest(db, "readwrite", (store) => {
		ids.forEach((id) => {
			const request = store.get(id);
			request.onsuccess = () => {
				const value = request.result;
				if (!value) return;
				store.put({ ...value, delivered: true });
			};
		});
	}).catch((error) => {
		console.warn("[sw] Failed to mark messages as delivered", error);
	});
};

const deleteMessagesByIds = async (ids) => {
	if (!ids.length) return;
	const db = await getUnreadDatabase();
	if (!db) return;

	await runStoreRequest(db, "readwrite", (store) => {
		ids.forEach((id) => {
			store.delete(id);
		});
	}).catch((error) => {
		console.warn("[sw] Failed to delete unread messages", error);
	});
};

const deleteConversationRecords = async (conversationId) => {
	if (!conversationId) return;
	const db = await getUnreadDatabase();
	if (!db) return;

	await runStoreRequest(db, "readwrite", (store) => {
		if (!store.indexNames.contains(UNREAD_CONVERSATION_INDEX)) {
			store.clear();
			return;
		}
		const index = store.index(UNREAD_CONVERSATION_INDEX);
		const range = IDBKeyRange.only(conversationId);
		index.openKeyCursor(range).onsuccess = (event) => {
			const cursor = event.target.result;
			if (!cursor) {
				return;
			}
			store.delete(cursor.primaryKey);
			cursor.continue();
		};
	}).catch((error) => {
		console.warn("[sw] Failed to delete conversation records", error);
	});
};

const getPendingUnreadRecords = async () => {
	const db = await getUnreadDatabase();
	if (!db) return [];

	const result = await runStoreRequest(db, "readonly", (store) =>
		store.getAll(),
	).catch((error) => {
		console.warn("[sw] Failed to read unread message records", error);
		return [];
	});

	if (!Array.isArray(result)) {
		return [];
	}

	return result.filter((record) => record && record.delivered !== true);
};

const countPendingUnread = async () => {
	const db = await getUnreadDatabase();
	if (!db) return 0;

	const result = await runStoreRequest(db, "readonly", (store) =>
		store.getAll(),
	).catch((error) => {
		console.warn("[sw] Failed to count unread messages", error);
		return [];
	});

	if (!Array.isArray(result)) {
		return 0;
	}

	return result.reduce(
		(count, record) =>
			record && record.delivered !== true ? count + 1 : count,
		0,
	);
};

const broadcastBadgeCount = async (count) => {
	const clients = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	clients.forEach((client) => {
		client.postMessage({ type: "peer:badge-count", count });
	});
};

const updateAppBadge = async () => {
	const count = await countPendingUnread();
	if ("setAppBadge" in self.registration) {
		try {
			if (count > 0) {
				await self.registration.setAppBadge(count);
			} else {
				await self.registration.clearAppBadge();
			}
		} catch (error) {
			console.warn("[sw] Failed to update app badge", error);
		}
	}

	await broadcastBadgeCount(count);
};

const scheduleBackgroundSync = async () => {
	if (self.registration.sync) {
		try {
			await self.registration.sync.register(PEER_SYNC_TAG);
		} catch (error) {
			console.warn("[sw] Failed to register background sync", error);
		}
	}

	if (self.registration.periodicSync) {
		try {
			await self.registration.periodicSync.register(PEER_PERIODIC_TAG, {
				minInterval: 15 * 60 * 1000,
			});
		} catch (error) {
			if (error?.name !== "NotAllowedError") {
				console.warn("[sw] Failed to register periodic sync", error);
			}
		}
	}
};

const maybeShowNotification = async (record) => {
	if (typeof Notification === "undefined") {
		return;
	}

	if (Notification.permission !== "granted") {
		return;
	}

	const title = record.conversationTitle || record.senderName || "New message";
	const body = record.body || record.message?.body || "You have a new message";
	const data = {
		conversationId: record.conversationId,
		messageId: record.messageId ?? null,
		url: record.url ?? "/",
	};

	if (!self.registration?.showNotification) {
		return;
	}

	try {
		await self.registration.showNotification(title, {
			body,
			badge: PEER_NOTIFICATION_BADGE,
			icon: PEER_NOTIFICATION_ICON,
			tag: `conversation:${record.conversationId}`,
			data,
			renotify: true,
			actions: [{ action: "open-chat", title: "Open chat" }],
		});
	} catch (error) {
		console.warn("[sw] Failed to display notification", error);
	}
};

const flushQueuedMessages = async () => {
	const clients = await self.clients.matchAll({
		type: "window",
		includeUncontrolled: true,
	});
	if (!clients.length) {
		return;
	}

	const pending = await getPendingUnreadRecords();
	if (!pending.length) {
		await updateAppBadge();
		return;
	}

	const payload = pending.map((record) => ({
		id: record.id,
		conversationId: record.conversationId,
		message: record.message,
	}));

	clients.forEach((client) => {
		client.postMessage({ type: "peer:queued-messages", messages: payload });
	});

	await markMessagesDelivered(pending.map((record) => record.id));
	await updateAppBadge();
};

const handlePeerMessageEvent = async (payload) => {
	if (!payload || typeof payload !== "object") {
		return;
	}

	const conversationId =
		typeof payload.conversationId === "string" ? payload.conversationId : null;
	const message = payload.message;
	if (!conversationId || !message) {
		return;
	}

	const isClientVisible = Boolean(payload.isClientVisible);
	if (isClientVisible) {
		await flushQueuedMessages();
		return;
	}

	const messageId =
		typeof payload.messageId === "string" ? payload.messageId : null;
	const recordId = messageId
		? `${conversationId}::${messageId}`
		: `${conversationId}::${Date.now()}`;

	const record = {
		id: recordId,
		conversationId,
		message,
		messageId,
		senderName:
			typeof payload.senderName === "string" ? payload.senderName : null,
		conversationTitle:
			typeof payload.conversationTitle === "string"
				? payload.conversationTitle
				: null,
		body: typeof payload.body === "string" ? payload.body : null,
		receivedAt:
			typeof payload.receivedAt === "number" ? payload.receivedAt : Date.now(),
		url: typeof payload.url === "string" ? payload.url : "/",
		delivered: false,
	};

	const stored = await putUnreadRecord(record);
	await updateAppBadge();
	if (stored) {
		await maybeShowNotification(record);
	}
	await scheduleBackgroundSync();
	await flushQueuedMessages();
};

const handleAckMessages = async (payload) => {
	const messageIds = Array.isArray(payload?.messageIds)
		? payload.messageIds.filter((value) => typeof value === "string" && value)
		: [];
	if (!messageIds.length) {
		return;
	}
	await deleteMessagesByIds(messageIds);
	await updateAppBadge();
};

const handleConversationOpened = async (payload) => {
	const conversationId =
		typeof payload?.conversationId === "string" ? payload.conversationId : null;
	if (!conversationId) {
		return;
	}
	await deleteConversationRecords(conversationId);
	await updateAppBadge();
};

self.addEventListener("message", (event) => {
	const payload = event.data;
	if (!payload || typeof payload !== "object") {
		return;
	}

	switch (payload.type) {
		case "peer:message":
			event.waitUntil(handlePeerMessageEvent(payload));
			break;
		case "peer:ack-messages":
			event.waitUntil(handleAckMessages(payload));
			break;
		case "peer:conversation-opened":
			event.waitUntil(handleConversationOpened(payload));
			break;
		case "peer:flush":
			event.waitUntil(flushQueuedMessages());
			break;
		default:
			break;
	}
});

self.addEventListener("sync", (event) => {
	if (event.tag === PEER_SYNC_TAG) {
		event.waitUntil(flushQueuedMessages());
	}
});

self.addEventListener("periodicsync", (event) => {
	if (event.tag === PEER_PERIODIC_TAG) {
		event.waitUntil(flushQueuedMessages());
	}
});

self.addEventListener("notificationclick", (event) => {
	event.notification.close();
	const data = event.notification.data ?? {};
	const targetUrl = typeof data.url === "string" ? data.url : "/";

	event.waitUntil(
		(async () => {
			const allClients = await self.clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});
			const origin = self.location.origin;
			const normalized = new URL(targetUrl, origin).href;
			for (const client of allClients) {
				if (client.url === normalized && "focus" in client) {
					await client.focus();
					return;
				}
			}
			await self.clients.openWindow(normalized);
		})(),
	);
});
