import { NextResponse } from "next/server";
import { z } from "zod";

import { getFriendState, removeFriendship } from "@/db/friends";
import { auth } from "@/lib/auth";

const paramsSchema = z.object({
  friendId: z.string().min(1, "friendId is required"),
});

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ friendId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = await context.params;
  const parseResult = paramsSchema.safeParse(params);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid friend id" }, { status: 400 });
  }

  const { friendId } = parseResult.data;
  const userId = session.user.id;

  try {
    await removeFriendship(userId, friendId);
    const state = await getFriendState(userId);

    return NextResponse.json({
      ...state,
      lastSyncedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to remove friend", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to remove friend",
      },
      { status: 400 },
    );
  }
}
