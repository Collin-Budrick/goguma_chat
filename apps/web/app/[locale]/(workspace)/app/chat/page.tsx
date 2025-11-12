import { redirect } from "next/navigation";

import ChatClient from "@/components/chat/ChatClient";
import type { FriendSummary } from "@/components/contacts/types";
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

type PageProps = {
  params: Promise<{ locale: string }>;
};

type ViewerProfile = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  image: string | null;
};

function toISODate(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) {
    return value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
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
    createdAt: toISODate(friend.createdAt) ?? new Date().toISOString(),
  }));
}

export default async function ChatPage({ params }: PageProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;
  const state = await getFriendState(userId);
  const friends = serializeFriends(state.friends);

  const viewer: ViewerProfile = {
    id: userId,
    email: session.user.email ?? null,
    firstName: session.user.firstName ?? null,
    lastName: session.user.lastName ?? null,
    image: session.user.image ?? null,
  };

  return <ChatClient viewer={viewer} friends={friends} />;
}
