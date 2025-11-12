import type { FriendSummary } from "@/components/contacts/types";
import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from "@/components/chat/types";
import {
  getDirectConversation,
  listConversationMessages,
  serializeConversation,
  serializeMessage,
} from "@/db/conversations";
import type { getFriendState } from "@/db/friends";
import type { auth } from "@/lib/auth";

function toISODate(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? new Date().toISOString()
    : parsed.toISOString();
}

export function serializeFriends(
  friends: Awaited<ReturnType<typeof getFriendState>>["friends"],
): FriendSummary[] {
  return friends.map((friend) => ({
    friendshipId: friend.friendshipId,
    friendId: friend.friendId,
    email: friend.email,
    firstName: friend.firstName,
    lastName: friend.lastName,
    image: friend.image,
    createdAt: toISODate(friend.createdAt),
    hasConversation: friend.hasConversation,
  }));
}

export function buildViewerProfile(
  session: Awaited<ReturnType<typeof auth>>,
): ChatUserProfile {
  return {
    id: session?.user?.id ?? "",
    email: typeof session?.user?.email === "string" ? session.user.email : null,
    firstName:
      typeof session?.user?.firstName === "string" ? session.user.firstName : null,
    lastName:
      typeof session?.user?.lastName === "string" ? session.user.lastName : null,
    image: typeof session?.user?.image === "string" ? session.user.image : null,
  };
}

export type InitialConversationPayload = {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  nextCursor: string | null;
};

export async function loadInitialConversation(
  viewerId: string,
  friendId: string,
): Promise<InitialConversationPayload> {
  try {
    const conversation = await getDirectConversation(viewerId, friendId);
    const page = await listConversationMessages(conversation.id, viewerId);

    return {
      conversation: serializeConversation(conversation),
      messages: page.messages.map((message) => serializeMessage(message)),
      nextCursor: page.nextCursor,
    };
  } catch (error) {
    console.error("Failed to load initial conversation", error);
    return { conversation: null, messages: [], nextCursor: null };
  }
}
