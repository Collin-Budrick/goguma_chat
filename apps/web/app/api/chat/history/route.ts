import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import type { ChatHistory, ChatMessage } from "@/lib/chat/types";
import { buildConversationId, resolveProfileName } from "../helpers";

const querySchema = z.object({
	friendId: z.string().min(1),
});

type HistoryOptions = {
	conversationId: string;
	friendId: string;
	viewerId: string;
	friendName: string;
	viewerName: string;
	startedAt?: Date | null;
};

function createMockHistory({
	conversationId,
	friendId,
	viewerId,
	friendName,
	viewerName,
	startedAt,
}: HistoryOptions): ChatMessage[] {
	const base = startedAt ? new Date(startedAt) : new Date();
	const timeline = [
		new Date(base.getTime() - 1000 * 60 * 42),
		new Date(base.getTime() - 1000 * 60 * 39),
		new Date(base.getTime() - 1000 * 60 * 35),
		new Date(base.getTime() - 1000 * 60 * 31),
	];

	return [
		{
			id: `${conversationId}:intro`,
			authorId: friendId,
			body: `Hey ${viewerName || "there"}! I just found a new spot for tonight's hangout. Want to check it out?`,
			sentAt: timeline[0].toISOString(),
		},
		{
			id: `${conversationId}:reply`,
			authorId: viewerId,
			body: `That sounds perfect, ${friendName}! I'm free after 7 — should I bring anything?`,
			sentAt: timeline[1].toISOString(),
		},
		{
			id: `${conversationId}:details`,
			authorId: friendId,
			body: `Maybe just your favorite playlist. I'll grab us a table and text the invite to everyone else.`,
			sentAt: timeline[2].toISOString(),
		},
		{
			id: `${conversationId}:wrap`,
			authorId: viewerId,
			body: `Deal. I'll queue up something cozy and head over a little early.`,
			sentAt: timeline[3].toISOString(),
		},
	];
}

export async function GET(request: NextRequest) {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parsed = querySchema.safeParse(
		Object.fromEntries(new URL(request.url).searchParams.entries()),
	);

	if (!parsed.success) {
		return NextResponse.json({ error: "Invalid request" }, { status: 400 });
	}

	const friendId = parsed.data.friendId;
	const state = await getFriendState(session.user.id);
	const friend = state.friends.find((entry) => entry.friendId === friendId);

	if (!friend) {
		return NextResponse.json({ error: "Not found" }, { status: 404 });
	}

	const conversationId = buildConversationId(session.user.id, friendId);
	const friendName = resolveProfileName({
		firstName: friend.firstName,
		lastName: friend.lastName,
		email: friend.email,
		fallback: friendId,
	});
	const viewerName = resolveProfileName({
		firstName: session.user.firstName,
		lastName: session.user.lastName,
		email: session.user.email ?? null,
		fallback: "you",
	});

	const messages = createMockHistory({
		conversationId,
		friendId,
		viewerId: session.user.id,
		friendName,
		viewerName,
		startedAt:
			friend.createdAt instanceof Date
				? friend.createdAt
				: new Date(friend.createdAt),
	});

	const payload: ChatHistory = {
		conversationId,
		friendId,
		messages,
	};

	return NextResponse.json(payload);
}
