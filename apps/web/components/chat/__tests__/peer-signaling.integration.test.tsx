import React, { useEffect } from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

import {
	initializeMessagingTransport,
	peerSignalingController,
	type TransportDependencies,
	type TransportHandle,
	type TransportMessage,
	type TransportState,
} from "@/lib/messaging-transport";
import type { MessagingMode } from "@/lib/messaging-mode";
import { usePeerConversationChannel } from "../usePeerConversationChannel";
import type { ChatMessage } from "../types";

const conversationId = "conversation-test";
const viewerProfile = {
	id: "viewer-1",
	email: null,
	firstName: "Viewer",
	lastName: null,
	image: null,
};

class MockSignalingBackend {
	offers: string[] = [];
	answers: string[] = [];

	publishOffer(token: string) {
		this.offers.push(token);
		this.answers.push(`${token}:answer`);
	}

	waitForAnswer(): Promise<string> {
		const answer = this.answers[this.answers.length - 1];
		return Promise.resolve(answer);
	}
}

class MockWebRTCConnection {
	constructor(
		private readonly emitMessage: (payload: TransportMessage) => void,
		private readonly emitState: (state: TransportState) => void,
		private readonly backend: MockSignalingBackend,
	) {}

	async start() {
		this.emitState("connecting");
		this.backend.publishOffer(`offer:${Date.now()}`);
		await this.backend.waitForAnswer();
		this.emitState("connected");
	}

	async send(payload: TransportMessage) {
		const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
		let parsed: {
			type?: string;
			conversationId?: string;
			body?: string;
			clientMessageId?: string;
		} | null = null;
		try {
			parsed = JSON.parse(raw);
		} catch {
			// ignore malformed payloads
		}

		if (
			parsed?.type === "message:send" &&
			parsed.conversationId &&
			parsed.clientMessageId
		) {
			const now = new Date().toISOString();
			const ackFrame = {
				type: "message:ack",
				conversationId: parsed.conversationId,
				clientMessageId: parsed.clientMessageId,
				message: {
					id: parsed.clientMessageId,
					conversationId: parsed.conversationId,
					senderId: "peer-1",
					body: parsed.body ?? "",
					createdAt: now,
					updatedAt: now,
					sender: {
						id: "peer-1",
						email: null,
						firstName: "Peer",
						lastName: null,
						image: null,
					},
				},
			} as const;
			this.emitMessage(JSON.stringify(ackFrame));
			return;
		}

		this.emitMessage(payload);
	}

	async close() {
		this.emitState("closed");
	}
}

const installDomShim = () => {
	const listeners = new Map<string, Set<EventListener>>();
	const windowMock = {
		addEventListener: (type: string, listener: EventListener) => {
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(listener);
		},
		removeEventListener: (type: string, listener: EventListener) => {
			listeners.get(type)?.delete(listener);
		},
		dispatchEvent: (event: Event) => {
			listeners.get(event.type)?.forEach((listener) => listener(event));
			return true;
		},
		setTimeout: globalThis.setTimeout.bind(globalThis),
		clearTimeout: globalThis.clearTimeout.bind(globalThis),
		localStorage: {
			storage: new Map<string, string>(),
			getItem(key: string) {
				return this.storage.get(key) ?? null;
			},
			setItem(key: string, value: string) {
				this.storage.set(key, value);
			},
			removeItem(key: string) {
				this.storage.delete(key);
			},
		},
	} as unknown as Window;

	(globalThis as { window?: Window }).window = windowMock;
	(globalThis as { navigator?: Navigator }).navigator = {} as Navigator;

	if (typeof globalThis.CustomEvent === "undefined") {
		class TestCustomEvent<T> extends Event {
			detail: T | null;
			constructor(type: string, params?: CustomEventInit<T>) {
				super(type, params);
				this.detail = params?.detail ?? null;
			}
		}
		(globalThis as { CustomEvent: typeof CustomEvent }).CustomEvent =
			TestCustomEvent as unknown as typeof CustomEvent;
	}

	if (!(globalThis.crypto as Crypto | undefined)?.randomUUID) {
		(globalThis as { crypto: Crypto }).crypto = {
			randomUUID: () => `uuid-${Math.random().toString(36).slice(2)}`,
		} as Crypto;
	}

	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
};

const uninstallDomShim = () => {
	delete (globalThis as Record<string, unknown>).window;
	delete (globalThis as Record<string, unknown>).navigator;
};

type HarnessProps = {
	transport: TransportHandle;
	events: Array<{ type: string; body?: string }>;
};

function ChannelHarness({ transport, events }: HarnessProps) {
	const channel = usePeerConversationChannel({
		transport,
		onHeartbeatTimeout: async () => {},
	});

	useEffect(
		() =>
			channel.subscribeMessages(conversationId, (event) => {
				if (event.type === "message") {
					events.push({ type: event.type, body: event.message.body });
				}
			}),
		[channel, events],
	);

	useEffect(() => {
		const optimistic = {
			id: "client-msg-1",
			conversationId,
			senderId: viewerProfile.id,
			body: "hello remote",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sender: viewerProfile,
		};

		channel
			.sendMessage({
				conversationId,
				body: optimistic.body,
				clientMessageId: optimistic.id,
				optimisticMessage: optimistic,
			})
			.catch(() => undefined);
	}, [channel]);

	return null;
}

function HeartbeatHarness({ transport }: { transport: TransportHandle }) {
	usePeerConversationChannel({ transport, onHeartbeatTimeout: async () => {} });
	return null;
}

function FallbackHarness({
	transport,
	events,
	message,
}: {
	transport: TransportHandle | null;
	events: Array<{ id: string; body: string }>;
	message: ChatMessage;
}) {
	const channel = usePeerConversationChannel({
		transport,
		onHeartbeatTimeout: async () => {},
	});

	useEffect(
		() =>
			channel.subscribeMessages(conversationId, (event) => {
				if (event.type === "message") {
					events.push({ id: event.message.id, body: event.message.body });
				}
			}),
		[channel, events],
	);

	useEffect(() => {
		channel
			.sendMessage({
				conversationId,
				body: message.body,
				clientMessageId: message.id,
				optimisticMessage: message,
			})
			.catch(() => undefined);
	}, [channel, message]);

	return null;
}

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

class SimpleTransportHandle implements TransportHandle {
	mode: MessagingMode = "progressive";
	state: TransportState = "connected";
	ready: Promise<void> = Promise.resolve();
	private readonly messageListeners = new Set<
		(payload: TransportMessage) => void
	>();
	private readonly stateListeners = new Set<(state: TransportState) => void>();
	private readonly errorListeners = new Set<(error: Error) => void>();

	constructor(private readonly backend: MockSignalingBackend) {}

	async connect() {
		if (this.state === "connected") return;
		this.state = "connected";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async disconnect() {
		if (this.state === "closed") return;
		this.state = "closed";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async send(payload: TransportMessage) {
		if (!this.backend.answers.length) {
			throw new Error("Signaling backend has no answers");
		}

		const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
		let parsed: {
			type?: string;
			conversationId?: string;
			body?: string;
			clientMessageId?: string;
		} | null = null;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}

		if (
			parsed?.type === "message:send" &&
			parsed.conversationId &&
			parsed.clientMessageId
		) {
			const now = new Date().toISOString();
			const ackFrame = {
				type: "message:ack",
				conversationId: parsed.conversationId,
				clientMessageId: parsed.clientMessageId,
				message: {
					id: parsed.clientMessageId,
					conversationId: parsed.conversationId,
					senderId: "peer-1",
					body: parsed.body ?? "",
					createdAt: now,
					updatedAt: now,
					sender: {
						id: "peer-1",
						email: null,
						firstName: "Peer",
						lastName: null,
						image: null,
					},
				},
			} as const;
			this.messageListeners.forEach((listener) =>
				listener(JSON.stringify(ackFrame)),
			);
		}
	}

	onMessage(listener: (payload: TransportMessage) => void) {
		this.messageListeners.add(listener);
		return () => this.messageListeners.delete(listener);
	}

	onStateChange(listener: (state: TransportState) => void) {
		this.stateListeners.add(listener);
		listener(this.state);
		return () => this.stateListeners.delete(listener);
	}

	onError(listener: (error: Error) => void) {
		this.errorListeners.add(listener);
		return () => this.errorListeners.delete(listener);
	}
}

class DeferredReadyTransport implements TransportHandle {
	mode: MessagingMode = "progressive";
	state: TransportState = "connected";
	sentPayloads: TransportMessage[] = [];
	ready: Promise<void>;
	private resolveReady: (() => void) | null = null;
	private readonly messageListeners = new Set<
		(payload: TransportMessage) => void
	>();
	private readonly stateListeners = new Set<(state: TransportState) => void>();
	private readonly errorListeners = new Set<(error: Error) => void>();

	constructor() {
		this.ready = new Promise((resolve) => {
			this.resolveReady = resolve;
		});
	}

	markReady() {
		this.resolveReady?.();
		this.resolveReady = null;
	}

	async connect() {
		if (this.state === "connected") return;
		this.state = "connected";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async disconnect() {
		if (this.state === "closed") return;
		this.state = "closed";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async send(payload: TransportMessage) {
		this.sentPayloads.push(payload);
	}

	onMessage(listener: (payload: TransportMessage) => void) {
		this.messageListeners.add(listener);
		return () => this.messageListeners.delete(listener);
	}

	onStateChange(listener: (state: TransportState) => void) {
		this.stateListeners.add(listener);
		listener(this.state);
		return () => this.stateListeners.delete(listener);
	}

	onError(listener: (error: Error) => void) {
		this.errorListeners.add(listener);
		return () => this.errorListeners.delete(listener);
	}
}

class ImmediateAckTransport implements TransportHandle {
	mode: MessagingMode = "progressive";
	state: TransportState = "connected";
	ready: Promise<void> = Promise.resolve();
	sentPayloads: TransportMessage[] = [];
	private readonly messageListeners = new Set<
		(payload: TransportMessage) => void
	>();
	private readonly stateListeners = new Set<(state: TransportState) => void>();
	private readonly errorListeners = new Set<(error: Error) => void>();

	async connect() {
		if (this.state === "connected") return;
		this.state = "connected";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async disconnect() {
		if (this.state === "closed") return;
		this.state = "closed";
		this.stateListeners.forEach((listener) => listener(this.state));
	}

	async send(payload: TransportMessage) {
		this.sentPayloads.push(payload);
		const raw = typeof payload === "string" ? payload : JSON.stringify(payload);
		try {
			const parsed = JSON.parse(raw) as {
				type?: string;
				conversationId?: string;
				body?: string;
				clientMessageId?: string;
			};

			if (
				parsed?.type === "message:send" &&
				parsed.conversationId &&
				parsed.clientMessageId
			) {
				const now = new Date().toISOString();
				const ackFrame = {
					type: "message:ack",
					conversationId: parsed.conversationId,
					clientMessageId: parsed.clientMessageId,
					message: {
						id: parsed.clientMessageId,
						conversationId: parsed.conversationId,
						senderId: "peer-1",
						body: parsed.body ?? "",
						createdAt: now,
						updatedAt: now,
						sender: {
							id: "peer-1",
							email: null,
							firstName: "Peer",
							lastName: null,
							image: null,
						},
					},
				} as const;
				this.messageListeners.forEach((listener) =>
					listener(JSON.stringify(ackFrame)),
				);
			}
		} catch {
			// ignore malformed payloads
		}
	}

	onMessage(listener: (payload: TransportMessage) => void) {
		this.messageListeners.add(listener);
		return () => this.messageListeners.delete(listener);
	}

	onStateChange(listener: (state: TransportState) => void) {
		this.stateListeners.add(listener);
		listener(this.state);
		return () => this.stateListeners.delete(listener);
	}

	onError(listener: (error: Error) => void) {
		this.errorListeners.add(listener);
		return () => this.errorListeners.delete(listener);
	}
}

describe("peer signaling integration", () => {
	beforeEach(() => {
		(
			globalThis as { __PEER_CRYPTO_READY_TIMEOUT__?: number }
		).__PEER_CRYPTO_READY_TIMEOUT__ = 0;
		installDomShim();
	});

	afterEach(() => {
		uninstallDomShim();
		delete (globalThis as { __PEER_CRYPTO_READY_TIMEOUT__?: number })
			.__PEER_CRYPTO_READY_TIMEOUT__;
		peerSignalingController.clear();
	});

	it("connects transport and delivers messages once the signaling backend echoes tokens", async () => {
		const backend = new MockSignalingBackend();
		const dependencies: TransportDependencies = {
			createWebRTC: async ({ emitMessage, emitState }) => {
				const connection = new MockWebRTCConnection(
					emitMessage,
					emitState,
					backend,
				);
				await connection.start();
				return connection;
			},
		};

		const controller = initializeMessagingTransport({ dependencies });
		await controller.whenReady();

		expect(controller.transport).toBeTruthy();
		expect(controller.transport?.state).toBe("connected");
		expect(backend.offers).toHaveLength(1);
		expect(backend.answers).toHaveLength(1);

		await controller.teardown();

		const events: Array<{ type: string; body?: string }> = [];
		const simpleTransport = new SimpleTransportHandle(backend);
		let renderer: TestRenderer.ReactTestRenderer | null = null;

		await act(async () => {
			renderer = TestRenderer.create(
				<ChannelHarness transport={simpleTransport} events={events} />,
			);
		});

		await act(async () => {
			await flushPromises();
			await flushPromises();
		});

		expect(
			events.some(
				(event) => event.type === "message" && event.body === "hello remote",
			),
		).toBe(true);

		await act(async () => {
			renderer?.unmount();
		});
		await controller.teardown();
	});

	it("defers heartbeat traffic until crypto session is ready", async () => {
		const transport = new DeferredReadyTransport();
		let renderer: TestRenderer.ReactTestRenderer | null = null;

		await act(async () => {
			renderer = TestRenderer.create(
				<HeartbeatHarness transport={transport} />,
			);
		});

		await act(async () => {
			await flushPromises();
			await flushPromises();
		});

		expect(transport.sentPayloads).toHaveLength(0);

		await act(async () => {
			transport.markReady();
			await flushPromises();
			await flushPromises();
		});

		expect(
			transport.sentPayloads.some((payload) => {
				try {
					const parsed = JSON.parse(payload as string) as {
						type?: string;
						kind?: string;
					};
					return parsed?.type === "heartbeat" && parsed?.kind === "ping";
				} catch {
					return false;
				}
			}),
		).toBe(true);

		await act(async () => {
			renderer?.unmount();
		});
	});

	it("waits for the crypto-ready timeout before sending heartbeats when trust is unknown", async () => {
		(
			globalThis as { __PEER_CRYPTO_READY_TIMEOUT__?: number }
		).__PEER_CRYPTO_READY_TIMEOUT__ = 25;

		const transport = new DeferredReadyTransport();
		let renderer: TestRenderer.ReactTestRenderer | null = null;

		await act(async () => {
			renderer = TestRenderer.create(
				<HeartbeatHarness transport={transport} />,
			);
		});

		await act(async () => {
			transport.markReady();
			await flushPromises();
			await flushPromises();
		});

		expect(transport.sentPayloads).toHaveLength(0);

		await act(async () => {
			await new Promise((resolve) => setTimeout(resolve, 40));
			await flushPromises();
			await flushPromises();
		});

		expect(
			transport.sentPayloads.some((payload) => {
				try {
					const parsed = JSON.parse(payload as string) as {
						type?: string;
						kind?: string;
					};
					return parsed?.type === "heartbeat" && parsed?.kind === "ping";
				} catch {
					return false;
				}
			}),
		).toBe(true);

		await act(async () => {
			renderer?.unmount();
		});
	});

	it("delivers messages over HTTP when the transport is unavailable", async () => {
		const events: Array<{ id: string; body: string }> = [];
		const optimistic: ChatMessage = {
			id: "http-client-1",
			conversationId,
			senderId: viewerProfile.id,
			body: "hello via http",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sender: viewerProfile,
		};

		const delivered: ChatMessage = {
			...optimistic,
			id: "server-http-1",
			body: "delivered via http",
		};

		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async (_url: RequestInfo | URL, _init?: RequestInit) =>
				new Response(JSON.stringify({ message: delivered }), { status: 200 }),
		);
		(globalThis as { fetch: typeof fetch }).fetch =
			fetchMock as unknown as typeof fetch;

		let renderer: TestRenderer.ReactTestRenderer | null = null;
		await act(async () => {
			renderer = TestRenderer.create(
				<FallbackHarness
					transport={null}
					events={events}
					message={optimistic}
				/>,
			);
		});

		await act(async () => {
			await flushPromises();
			await flushPromises();
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(events.some((event) => event.id === delivered.id)).toBe(true);

		await act(async () => {
			renderer?.unmount();
		});

		(globalThis as { fetch: typeof fetch }).fetch = originalFetch;
	});

	it("flushes queued messages once a transport becomes available", async () => {
		const events: Array<{ id: string; body: string }> = [];
		const optimistic: ChatMessage = {
			id: "queued-client-1",
			conversationId,
			senderId: viewerProfile.id,
			body: "queued while offline",
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			sender: viewerProfile,
		};

		const originalFetch = globalThis.fetch;
		const fetchMock = mock(
			async () => new Response("offline", { status: 500 }),
		);
		(globalThis as { fetch: typeof fetch }).fetch =
			fetchMock as unknown as typeof fetch;

		let renderer: TestRenderer.ReactTestRenderer | null = null;
		await act(async () => {
			renderer = TestRenderer.create(
				<FallbackHarness
					transport={null}
					events={events}
					message={optimistic}
				/>,
			);
		});

		await act(async () => {
			await flushPromises();
			await flushPromises();
		});

		expect(fetchMock).toHaveBeenCalled();

		const transport = new ImmediateAckTransport();
		await act(async () => {
			renderer?.update(
				<FallbackHarness
					transport={transport}
					events={events}
					message={optimistic}
				/>,
			);
			await flushPromises();
			await flushPromises();
		});

		expect(
			transport.sentPayloads.some((payload) => {
				try {
					const parsed = JSON.parse(payload as string) as {
						type?: string;
						clientMessageId?: string;
					};
					return (
						parsed.type === "message:send" &&
						parsed.clientMessageId === optimistic.id
					);
				} catch {
					return false;
				}
			}),
		).toBe(true);
		expect(events.some((event) => event.id === optimistic.id)).toBe(true);

		await act(async () => {
			renderer?.unmount();
		});

		(globalThis as { fetch: typeof fetch }).fetch = originalFetch;
	});
});
