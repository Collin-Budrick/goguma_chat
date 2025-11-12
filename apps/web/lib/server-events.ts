import { EventEmitter } from "node:events";

import type { SerializedMessage } from "@/db/conversations";

type TypingPayload = {
  userId: string;
  isTyping: boolean;
  expiresAt: string;
};

type ConversationEvent =
  | { type: "message"; conversationId: string; message: SerializedMessage; clientMessageId?: string }
  | { type: "typing"; conversationId: string; typing: TypingPayload };

const emitter = new EventEmitter();

emitter.setMaxListeners(0);

export function emitConversationEvent(event: ConversationEvent) {
  emitter.emit(event.conversationId, event);
}

export function subscribeToConversationEvents(
  conversationId: string,
  listener: (event: ConversationEvent) => void,
) {
  emitter.on(conversationId, listener);
  return () => {
    emitter.off(conversationId, listener);
  };
}

export type { ConversationEvent, TypingPayload };
