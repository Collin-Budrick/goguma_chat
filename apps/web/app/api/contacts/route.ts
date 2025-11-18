import { NextResponse } from "next/server";

import { getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

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
		console.error("Failed to load contacts", error);
		return NextResponse.json(
			{ error: "Internal server error" },
			{ status: 500 },
		);
	}
}
