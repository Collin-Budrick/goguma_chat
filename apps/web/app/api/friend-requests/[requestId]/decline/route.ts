import { NextResponse } from "next/server";
import { z } from "zod";

import { declineFriendRequest, getFriendState } from "@/db/friends";
import { auth } from "@/lib/auth";

const paramsSchema = z.object({
  requestId: z.string().min(1, "requestId is required"),
});

export async function POST(
  _request: Request,
  context: { params: { requestId: string } },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parseResult = paramsSchema.safeParse(context.params);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request id" }, { status: 400 });
  }

  const userId = session.user.id;
  const { requestId } = parseResult.data;

  try {
    await declineFriendRequest(requestId, userId);
    const state = await getFriendState(userId);

    return NextResponse.json({
      ...state,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to decline friend request", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to decline friend request",
      },
      { status: 400 },
    );
  }
}
