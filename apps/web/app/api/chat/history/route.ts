import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import type { ChatHistory } from "@/lib/chat/types";
import { buildConversationId, resolveProfileName } from "../helpers";
import { createMockHistory, validateDate } from "./utils";

const querySchema = z.object({
        friendId: z.string().min(1),
});

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

        const startedAt = validateDate(
                friend.createdAt instanceof Date
                        ? friend.createdAt
                        : new Date(friend.createdAt),
        );

        if (!startedAt && friend.createdAt) {
                return NextResponse.json(
                        { error: "Invalid friend creation timestamp" },
                        { status: 500 },
                );
        }

        const messages = createMockHistory({
                conversationId,
                friendId,
                viewerId: session.user.id,
                friendName,
                viewerName,
                startedAt,
        });

	const payload: ChatHistory = {
		conversationId,
		friendId,
		messages,
	};

	return NextResponse.json(payload);
}
