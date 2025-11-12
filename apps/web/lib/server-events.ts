import { EventEmitter } from "node:events";

import type { SerializedMessage } from "@/db/conversations";
import type { MessagingMode } from "@/lib/messaging-mode-shared";

type TypingPayload = {
  userId: string;
  isTyping: boolean;
  expiresAt: string;
};

type ConversationEvent =
  | {
      type: "message";
      conversationId: string;
      message: SerializedMessage;
      clientMessageId?: string;
    }
  | { type: "typing"; conversationId: string; typing: TypingPayload }
  | {
      type: "settings";
      conversationId: string;
      settings: { messagingMode: MessagingMode };
      updatedAt: string;
      updatedBy: string;
    };

type DockIndicatorScope = "chat" | "contacts" | "all";

type DockIndicatorEvent = {
  type: "refresh";
  scope: DockIndicatorScope;
  reason?: string;
  conversationId?: string;
  requestId?: string;
};

const conversationEmitter = new EventEmitter();
const indicatorEmitter = new EventEmitter();

conversationEmitter.setMaxListeners(0);
indicatorEmitter.setMaxListeners(0);

export function emitConversationEvent(event: ConversationEvent) {
  conversationEmitter.emit(event.conversationId, event);
}

export function subscribeToConversationEvents(
  conversationId: string,
  listener: (event: ConversationEvent) => void,
) {
  conversationEmitter.on(conversationId, listener);
  return () => {
    conversationEmitter.off(conversationId, listener);
  };
}

export function emitDockIndicatorEvent(
  userId: string,
  event: DockIndicatorEvent,
) {
  indicatorEmitter.emit(userId, event);
}

export function subscribeToDockIndicatorEvents(
  userId: string,
  listener: (event: DockIndicatorEvent) => void,
) {
  indicatorEmitter.on(userId, listener);
  return () => {
    indicatorEmitter.off(userId, listener);
  };
}

export type {
  ConversationEvent,
  DockIndicatorEvent,
  DockIndicatorScope,
  TypingPayload,
};
