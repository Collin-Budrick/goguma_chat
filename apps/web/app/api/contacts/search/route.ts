import { NextRequest, NextResponse } from "next/server";

import {
  SEARCH_MIN_LENGTH,
  SEARCH_RESULT_LIMIT,
  getFriendSnapshot,
  searchPotentialFriends,
} from "@/db/friends";
import { auth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query") ?? "";
  const trimmed = query.trim();

  const results =
    trimmed.length < SEARCH_MIN_LENGTH
      ? []
      : await searchPotentialFriends(
          session.user.id,
          trimmed,
          SEARCH_RESULT_LIMIT,
        );

  const snapshot = await getFriendSnapshot(session.user.id);

  return NextResponse.json({
    ...snapshot,
    results,
    query: trimmed,
    lastSyncedAt: new Date().toISOString(),
  });
}
