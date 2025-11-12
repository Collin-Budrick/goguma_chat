import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import ChatClient from "@/components/chat/ChatClient";
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
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

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
    title: t("roster.title"),
  };
}

function toISODate(value: Date | string | null | undefined) {
  if (!value) return new Date().toISOString();
  if (value instanceof Date) {
    return value.toISOString();
  }
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

function buildViewerProfile(
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

type InitialConversationPayload = {
  conversation: ChatConversation | null;
  messages: ChatMessage[];
  nextCursor: string | null;
};

async function loadInitialConversation(
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

  if (friends.length === 0) {
    return (
      <ChatClient
        viewerId={viewerId}
        viewerProfile={viewerProfile}
        friends={friends}
        initialFriendId={null}
        initialConversation={null}
        initialMessages={[]}
        initialCursor={null}
      />
    );
  }

  const { friendId: requestedFriendId } = await searchParams;
  const friendIds = new Set(friends.map((friend) => friend.friendId));
  const initialFriendId =
    requestedFriendId && friendIds.has(requestedFriendId)
      ? requestedFriendId
      : friends[0]?.friendId ?? null;

  let initialConversation: ChatConversation | null = null;
  let initialMessages: ChatMessage[] = [];
  let initialCursor: string | null = null;

  if (initialFriendId) {
    const payload = await loadInitialConversation(viewerId, initialFriendId);
    initialConversation = payload.conversation;
    initialMessages = payload.messages;
    initialCursor = payload.nextCursor;
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
