import { NextResponse } from "next/server";

import { listUnreadConversations } from "@/db/conversations";
import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const excludeConversationId = url.searchParams.get("exclude");

  try {
    const conversations = await listUnreadConversations(session.user.id, {
      excludeConversationId,
    });
    const total = conversations.reduce(
      (acc, conversation) =>
        acc + (Number.isFinite(conversation.unreadCount) ? conversation.unreadCount : 0),
      0,
    );

    return NextResponse.json({ conversations, total });
  } catch (error) {
    console.error("Failed to load unread conversations", error);
    return NextResponse.json(
      { error: "Failed to load unread conversations" },
      { status: 500 },
    );
  }
}
