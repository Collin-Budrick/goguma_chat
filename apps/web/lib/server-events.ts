import { EventEmitter } from "node:events";

import type { SerializedMessage } from "@/db/conversations";
import {
  CONVERSATION_EMITTER_GLOBAL_KEY,
  INDICATOR_EMITTER_GLOBAL_KEY,
} from "./server-events-globals";
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
  | { type: "typing"; conversationId: string; typing: TypingPayload };

type DockIndicatorScope = "chat" | "contacts" | "all";

type DockIndicatorEvent = {
  type: "refresh";
  scope: DockIndicatorScope;
  reason?: string;
  conversationId?: string;
  requestId?: string;
};

declare global {
  var __gogumaConversationEventEmitter__:
    | EventEmitter
    | undefined;
  var __gogumaIndicatorEventEmitter__:
    | EventEmitter
    | undefined;
}

const conversationGlobalScope =
  globalThis as typeof globalThis &
    Record<typeof CONVERSATION_EMITTER_GLOBAL_KEY, EventEmitter | undefined>;
const indicatorGlobalScope =
  globalThis as typeof globalThis &
    Record<typeof INDICATOR_EMITTER_GLOBAL_KEY, EventEmitter | undefined>;

const conversationEmitter =
  conversationGlobalScope[CONVERSATION_EMITTER_GLOBAL_KEY] ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    conversationGlobalScope[CONVERSATION_EMITTER_GLOBAL_KEY] = emitter;
    return emitter;
  })();

const indicatorEmitter =
  indicatorGlobalScope[INDICATOR_EMITTER_GLOBAL_KEY] ??
  (() => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    indicatorGlobalScope[INDICATOR_EMITTER_GLOBAL_KEY] = emitter;
    return emitter;
  })();

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
