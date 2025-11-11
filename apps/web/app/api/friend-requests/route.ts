import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  FriendOperationError,
  createFriendRequest,
  getFriendSnapshot,
} from "@/db/friends";
import { auth } from "@/lib/auth";

const createFriendRequestSchema = z
  .object({
    recipientId: z.string().trim().min(1).optional(),
    userId: z.string().trim().min(1).optional(),
  })
  .refine((value) => value.recipientId || value.userId, {
    message: "recipientId is required",
    path: ["recipientId"],
  });

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  const snapshot = await getFriendSnapshot(session.user.id);

  return NextResponse.json({
    ...snapshot,
    lastSyncedAt: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const session = await auth();

  if (!session?.user?.id) {
    return unauthorized();
  }

  let payload: z.infer<typeof createFriendRequestSchema>;

  try {
    const json = await request.json();
    payload = createFriendRequestSchema.parse(json);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const message = error.issues[0]?.message ?? "Invalid request";
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const recipientId = payload.recipientId ?? payload.userId;

  if (!recipientId) {
    return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
  }

  try {
    await createFriendRequest(session.user.id, recipientId);
  } catch (error) {
    if (error instanceof FriendOperationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to create friend request" }, { status: 500 });
  }

  const snapshot = await getFriendSnapshot(session.user.id);

  return NextResponse.json(
    {
      ...snapshot,
      lastSyncedAt: new Date().toISOString(),
    },
    { status: 201 },
  );
}
