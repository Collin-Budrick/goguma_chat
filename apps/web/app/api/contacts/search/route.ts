import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState, searchUsers } from "@/db/friends";
import { auth } from "@/lib/auth";

const MIN_QUERY_LENGTH = 2;
const SEARCH_LIMIT = 10;

const querySchema = z.object({
	query: z.string().optional(),
});

export async function GET(request: NextRequest) {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const parseResult = querySchema.safeParse({
		query: request.nextUrl.searchParams.get("query"),
	});

	if (!parseResult.success) {
		return NextResponse.json(
			{ error: "Invalid search query" },
			{ status: 400 },
		);
	}

	const userId = session.user.id;

	try {
		const state = await getFriendState(userId);
		const query = (parseResult.data.query ?? "").trim();
		let matches: Awaited<ReturnType<typeof searchUsers>> = [];

		if (query.length >= MIN_QUERY_LENGTH) {
			const excludeIds = new Set<string>([userId]);

			for (const friend of state.friends) {
				excludeIds.add(friend.friendId);
			}

			for (const request of state.incoming) {
				excludeIds.add(request.senderId);
				excludeIds.add(request.recipientId);
			}

			for (const request of state.outgoing) {
				excludeIds.add(request.senderId);
				excludeIds.add(request.recipientId);
			}

			matches = await searchUsers(query, {
				limit: SEARCH_LIMIT,
				excludeUserIds: Array.from(excludeIds),
			});
		}

		return NextResponse.json({
			...state,
			matches,
			lastSyncedAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Failed to search contacts", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
