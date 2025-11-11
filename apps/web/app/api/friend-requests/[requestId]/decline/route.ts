import { NextResponse } from "next/server";
import { z } from "zod";

import {
  FriendOperationError,
  declineFriendRequest,
  getFriendSnapshot,
} from "@/db/friends";
import { auth } from "@/lib/auth";

const paramsSchema = z.object({
  requestId: z.string().min(1),
});

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(
  _request: Request,
  context: { params: { requestId?: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const parseResult = paramsSchema.safeParse(context.params);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    await declineFriendRequest(parseResult.data.requestId, session.user.id);
  } catch (error) {
    if (error instanceof FriendOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to decline friend request" }, { status: 500 });
  }

  const snapshot = await getFriendSnapshot(session.user.id);

  return NextResponse.json({
    ...snapshot,
    lastSyncedAt: new Date().toISOString(),
  });
}
