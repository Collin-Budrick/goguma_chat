import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import ChatPageShell from "@/components/chat/chat-page-shell";
import ChatClient from "@/components/chat/ChatClient";
import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import {
  buildViewerProfile,
  loadInitialConversation,
  serializeFriends,
} from "./utils";

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

export default function ChatPage(props: PageProps) {
  return (
    <Suspense fallback={<ChatPageShell />}>
      <ChatContent {...props} />
    </Suspense>
  );
}

async function ChatContent({ params, searchParams }: PageProps) {
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

  type InitialPayload = Awaited<ReturnType<typeof loadInitialConversation>>;

  let initialConversation: InitialPayload["conversation"] = null;
  let initialMessages: InitialPayload["messages"] = [];
  let initialCursor: InitialPayload["nextCursor"] = null;

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
