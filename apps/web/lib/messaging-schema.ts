import type {
  ChatConversation,
  ChatMessage,
  TypingEvent,
} from "@/components/chat/types";

/**
 * Describes a direct message sent across the peer transport channel.
 */
export type PeerMessageFrame = {
  type: "message";
  conversationId: string;
  message: ChatMessage;
  clientMessageId?: string | null;
};

/**
 * Acknowledges a previously sent message. When successful it will include the
 * canonical message payload so optimistic UI entries can be reconciled.
 */
export type PeerMessageAckFrame = {
  type: "message:ack";
  conversationId: string | null;
  message?: ChatMessage;
  clientMessageId?: string | null;
  error?: string;
};

/**
 * Provides a full snapshot of a conversation plus the next pagination cursor.
 */
export type PeerHistorySyncFrame = {
  type: "history:sync";
  conversationId: string | null;
  messages: ChatMessage[];
  nextCursor?: string | null;
  conversation?: ChatConversation | null;
  requestId?: string;
};

/**
 * Provides a page of historical messages for a conversation.
 */
export type PeerHistoryPageFrame = {
  type: "history:page";
  conversationId: string | null;
  messages: ChatMessage[];
  nextCursor?: string | null;
  requestId?: string;
};

/**
 * Broadcasts an updated conversation descriptor (e.g. when settings change).
 */
export type PeerConversationFrame = {
  type: "conversation";
  conversation: ChatConversation;
};

/**
 * Legacy typing frame maintained for backwards compatibility with older
 * experimental builds.
 */
export type PeerLegacyTypingFrame = {
  type: "typing";
  conversationId: string;
  typing: TypingEvent;
};

/**
 * Indicates that the peer transport encountered an error while handling a
 * request.
 */
export type PeerErrorFrame = {
  type: "error";
  message?: string;
  conversationId?: string;
  requestId?: string;
};

/**
 * Presence payload indicating when a participant is actively composing text.
 */
export type PeerPresenceTyping = {
  kind: "typing";
  conversationId: string;
  typing: TypingEvent;
};

/**
 * Presence payload emitted when a participant reads up to the most recent
 * message in a conversation.
 */
export type PeerPresenceReadReceipt = {
  kind: "read";
  conversationId: string;
  userId: string;
  lastMessageId: string | null;
  readAt: string;
};

/**
 * Presence payload emitted when a message has been delivered and acknowledged
 * by the receiving participant.
 */
export type PeerPresenceDeliveryAck = {
  kind: "delivery";
  conversationId: string;
  userId: string;
  messageId: string;
  clientMessageId?: string | null;
  deliveredAt: string;
};

export type PeerPresenceUpdate =
  | PeerPresenceTyping
  | PeerPresenceReadReceipt
  | PeerPresenceDeliveryAck;

/**
 * Envelope for all presence related peer events.
 */
export type PeerPresenceFrame = {
  type: "presence";
  conversationId: string;
  presence: PeerPresenceUpdate;
};

/**
 * Lightweight keepalive frame exchanged periodically so peers can detect
 * stalled transports and trigger reconnection flows.
 */
export type PeerHeartbeatFrame = {
  type: "heartbeat";
  kind: "ping" | "pong";
  timestamp: number;
};

export type PeerHandshakeFrame = {
  type: "handshake";
  handshake: {
    kind: "offer" | "answer";
    token: string;
  };
};

/**
 * Union describing all frames that can be received over the peer transport
 * channel.
 */
export type PeerTransportIncomingFrame =
  | PeerMessageFrame
  | PeerMessageAckFrame
  | PeerHistorySyncFrame
  | PeerHistoryPageFrame
  | PeerConversationFrame
  | PeerPresenceFrame
  | PeerLegacyTypingFrame
  | PeerErrorFrame
  | PeerHeartbeatFrame
  | PeerHandshakeFrame;
