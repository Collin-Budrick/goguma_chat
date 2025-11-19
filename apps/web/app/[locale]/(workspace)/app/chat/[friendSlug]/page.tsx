import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import ChatThread from "@/components/chat/ChatThread";
import ChatPageShell from "@/components/chat/chat-page-shell";
import type { FriendSummary } from "@/components/contacts/types";
import { auth } from "@/lib/auth";
import { buildViewerProfile, loadInitialConversation } from "../utils";

function buildFriendFromConversation(
	friendId: string,
	payload: Awaited<ReturnType<typeof loadInitialConversation>>,
): FriendSummary | null {
	const conversation = payload.conversation;
	if (!conversation) return null;

	const participant = conversation.participants.find(
		(member) => member.userId === friendId,
	);

	if (!participant) {
		return null;
	}

	return {
		friendshipId: `${conversation.id}:${friendId}`,
		friendId,
		email: participant.user.email,
		firstName: participant.user.firstName,
		lastName: participant.user.lastName,
		image: participant.user.image,
		createdAt: conversation.createdAt,
		hasConversation: true,
	};
}

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

export default function FriendChatPage(props: PageProps) {
	return (
		<Suspense fallback={<ChatPageShell />}>
			<FriendChatContent {...props} />
		</Suspense>
	);
}

async function FriendChatContent({ params }: PageProps) {
	const { locale, friendSlug } = await params;
	const session = await auth();

	if (!session?.user?.id) {
		redirect(`/${locale}/login`);
	}

	const viewerId = session.user.id;
	const viewerProfile = buildViewerProfile(session);
	const payload = await loadInitialConversation(viewerId, friendSlug);
	const friend = buildFriendFromConversation(friendSlug, payload);

	if (!payload.conversation || !friend) {
		notFound();
	}

	return (
		<div className="flex flex-1 h-full min-h-0 w-full">
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
