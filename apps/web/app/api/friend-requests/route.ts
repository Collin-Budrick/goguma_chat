import { NextResponse } from "next/server";
import { z } from "zod";

import { createFriendRequest, getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import { emitDockIndicatorEvent } from "@/lib/server-events";

const createFriendRequestSchema = z.object({
	recipientId: z.string().min(1, "recipientId is required"),
});

export async function GET() {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	try {
		const state = await getFriendState(session.user.id);

		return NextResponse.json({
			...state,
			lastSyncedAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Failed to load friend requests", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}

export async function POST(request: Request) {
	const session = await auth();

	if (!session?.user?.id) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	let payload: unknown;

	try {
		payload = await request.json();
	} catch (error) {
		console.error("Invalid JSON payload", error);
		return NextResponse.json(
			{ error: "Invalid request body" },
			{ status: 400 },
		);
	}

	const parseResult = createFriendRequestSchema.safeParse(payload);

	if (!parseResult.success) {
		return NextResponse.json(
			{ error: "recipientId is required" },
			{ status: 400 },
		);
	}

	const userId = session.user.id;
	const { recipientId } = parseResult.data;

	if (recipientId === userId) {
		return NextResponse.json(
			{ error: "Cannot send a friend request to yourself" },
			{ status: 400 },
		);
	}

	try {
		const request = await createFriendRequest(userId, recipientId);
		const state = await getFriendState(userId);

		emitDockIndicatorEvent(recipientId, {
			type: "refresh",
			scope: "contacts",
			reason: "friend-request-created",
			requestId: request.id,
		});
		emitDockIndicatorEvent(userId, {
			type: "refresh",
			scope: "contacts",
			reason: "friend-request-created",
			requestId: request.id,
		});

		return NextResponse.json({
			...state,
			lastSyncedAt: new Date().toISOString(),
		});
	} catch (error) {
		console.error("Failed to create friend request", error);
		return NextResponse.json(
			{
				error:
					error instanceof Error
						? error.message
						: "Unable to create friend request",
			},
			{ status: 400 },
		);
	}
}
