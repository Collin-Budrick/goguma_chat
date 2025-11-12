import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import ChatThread from "@/components/chat/ChatThread";
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

import {
  buildViewerProfile,
  loadInitialConversation,
  serializeFriends,
} from "../utils";

type PageProps = {
  params: Promise<{ locale: string; friendSlug: string }>;
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

export default async function FriendChatPage({ params }: PageProps) {
  const { locale, friendSlug } = await params;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const viewerId = session.user.id;
  const viewerProfile = buildViewerProfile(session);
  const friendState = await getFriendState(viewerId);
  const friends = serializeFriends(friendState.friends);
  const friend = friends.find((item) => item.friendId === friendSlug) ?? null;

  if (!friend) {
    notFound();
  }

  const payload = await loadInitialConversation(viewerId, friend.friendId);

  return (
    <div className="flex h-full">
      <ChatThread
        viewerId={viewerId}
        viewerProfile={viewerProfile}
        friend={friend}
        initialFriendId={friend.friendId}
        initialConversation={payload.conversation}
        initialMessages={payload.messages}
        initialCursor={payload.nextCursor}
      />
    </div>
  );
}
