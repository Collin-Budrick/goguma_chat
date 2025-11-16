export type ChatUserProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
};

export type ChatParticipant = {
  conversationId: string;
  userId: string;
  joinedAt: string;
  user: ChatUserProfile;
};

export type ChatConversation = {
  id: string;
  type: "direct" | string;
  directKey: string | null;
  createdAt: string;
  updatedAt: string;
  participants: ChatParticipant[];
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  sender: ChatUserProfile;
};

export type ConversationHistoryResponse = {
  messages: ChatMessage[];
  nextCursor: string | null;
};

export type ConversationBootstrap = {
  conversation: ChatConversation;
  messages: ChatMessage[];
  nextCursor: string | null;
};

export type TypingEvent = {
  userId: string;
  isTyping: boolean;
  expiresAt: string;
};
