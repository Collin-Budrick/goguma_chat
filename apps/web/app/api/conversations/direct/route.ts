import { NextResponse } from "next/server";

import {
  getDirectConversation,
  listConversationMessages,
  serializeConversation,
  serializeMessage,
} from "@/db/conversations";
import { auth } from "@/lib/auth";

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const friendId =
    body && typeof body === "object" && "friendId" in body
      ? (body.friendId as string)
      : undefined;
  const limit =
    body && typeof body === "object" && "limit" in body
      ? Number((body as { limit?: unknown }).limit)
      : undefined;

  if (!friendId || typeof friendId !== "string") {
    return NextResponse.json({ error: "friendId is required" }, { status: 400 });
  }

  const viewerId = session.user.id;

  try {
    const conversation = await getDirectConversation(viewerId, friendId);
    const page = await listConversationMessages(conversation.id, viewerId, {
      limit,
    });

    return NextResponse.json({
      conversation: serializeConversation(conversation),
      messages: page.messages.map((message) => serializeMessage(message)),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load conversation";

    if (message.includes("not friends")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
