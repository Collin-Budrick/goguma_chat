import { expect, it } from "bun:test";
import { EventEmitter } from "node:events";

import type { SerializedMessage } from "../../db/conversations";
import { CONVERSATION_EMITTER_GLOBAL_KEY } from "../server-events-globals";

it("reuses the global conversation emitter across module instances", async () => {
	const globalScope = globalThis as typeof globalThis &
		Record<typeof CONVERSATION_EMITTER_GLOBAL_KEY, EventEmitter | undefined>;
	const previousEmitter = globalScope[CONVERSATION_EMITTER_GLOBAL_KEY];
	const sentinel = new EventEmitter();
	globalScope[CONVERSATION_EMITTER_GLOBAL_KEY] = sentinel;

	const { emitConversationEvent, subscribeToConversationEvents } = await import(
		"../server-events"
	);

	const conversationId = "test-conversation";
	const timestamp = new Date().toISOString();
	const serializedMessage: SerializedMessage = {
		id: "message-1",
		conversationId,
		senderId: "user-1",
		body: "hello",
		createdAt: timestamp,
		updatedAt: timestamp,
		sender: {
			id: "user-1",
			email: "hello@example.com",
			firstName: "Hello",
			lastName: "World",
			image: null,
		},
	};

	const received = new Promise<void>((resolve) => {
		const unsubscribe = subscribeToConversationEvents(
			conversationId,
			(event) => {
				expect(event).toMatchObject({
					type: "message",
					conversationId,
					message: {
						id: "message-1",
					},
				});
				unsubscribe();
				resolve();
			},
		);
	});

	emitConversationEvent({
		type: "message",
		conversationId,
		message: serializedMessage,
		clientMessageId: "client-1",
	});

	await received;

	sentinel.removeAllListeners();
	globalScope[CONVERSATION_EMITTER_GLOBAL_KEY] = previousEmitter;
});
