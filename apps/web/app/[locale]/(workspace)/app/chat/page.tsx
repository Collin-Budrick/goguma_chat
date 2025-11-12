import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import ChatClient from "@/components/chat/ChatClient";
import type { FriendSummary } from "@/components/contacts/types";
import {
  getDirectConversation,
  listConversationMessages,
  serializeConversation,
  serializeMessage,
} from "@/db/conversations";
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

import type {
  ChatConversation,
  ChatMessage,
  ChatUserProfile,
} from "@/components/chat/types";

type PageProps = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ friendId?: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });
  return {
    title: t("sidebar.title"),
  };
}

function toISODate(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function serializeFriends(
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
  }));
}

function buildViewerProfile(session: Awaited<ReturnType<typeof auth>>): ChatUserProfile {
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

async function loadInitialConversation(
  viewerId: string,
  friendId: string,
): Promise<{
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  nextCursor: string | null;
}> {
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

export default async function ChatPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const viewerId = session.user.id;
  const viewerProfile = buildViewerProfile(session);
  const friendState = await getFriendState(viewerId);
  const friends = serializeFriends(friendState.friends);
  const search = await searchParams;

  const requestedFriendId = search.friendId;
  const availableFriendIds = new Set(friends.map((friend) => friend.friendId));
  const initialFriendId =
    requestedFriendId && availableFriendIds.has(requestedFriendId)
      ? requestedFriendId
      : friends[0]?.friendId ?? null;

  let initialConversation: ChatConversation | null = null;
  let initialMessages: ChatMessage[] = [];
  let initialCursor: string | null = null;

  if (initialFriendId) {
    const loaded = await loadInitialConversation(viewerId, initialFriendId);
    initialConversation = loaded.conversation;
    initialMessages = loaded.messages;
    initialCursor = loaded.nextCursor;
  }

  return (
    <ChatClient
      viewerId={viewerId}
      viewerProfile={viewerProfile}
      friends={friends}
      initialFriendId={initialFriendId}
      initialConversation={initialConversation}
      initialMessages={initialMessages}
      initialCursor={initialCursor}
    />
  );
}
