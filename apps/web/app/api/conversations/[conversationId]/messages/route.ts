import { NextResponse } from "next/server";

import { listConversationMessages, serializeMessage } from "@/db/conversations";
import { auth } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : undefined;

  try {
    const page = await listConversationMessages(conversationId, session.user.id, {
      beforeMessageId: cursor ?? undefined,
      limit,
    });

    return NextResponse.json({
      messages: page.messages.map((message) => serializeMessage(message)),
      nextCursor: page.nextCursor,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages";

    if (message.includes("not a conversation participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
