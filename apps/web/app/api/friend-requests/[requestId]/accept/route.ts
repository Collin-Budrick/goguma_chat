import { NextResponse } from "next/server";
import { z } from "zod";

import { acceptFriendRequest, getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";
import { emitDockIndicatorEvent } from "@/lib/server-events";

const paramsSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
});

export async function POST(
  _request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parseResult = paramsSchema.safeParse(params);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  const userId = session.user.id;
  const { requestId } = parseResult.data;

  try {
    const request = await acceptFriendRequest(requestId, userId);
    const state = await getFriendState(userId);

    emitDockIndicatorEvent(userId, {
      type: "refresh",
      scope: "contacts",
      reason: "friend-request-accepted",
      requestId,
    });
    emitDockIndicatorEvent(request.senderId, {
      type: "refresh",
      scope: "contacts",
      reason: "friend-request-accepted",
      requestId,
    });

    return NextResponse.json({
      ...state,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to accept friend request", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to accept friend request",
      },
      { status: 400 },
    );
  }
}
