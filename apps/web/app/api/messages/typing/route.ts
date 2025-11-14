import { NextResponse } from "next/server";

import { ensureConversationParticipant } from "@/db/conversations";
import { auth } from "@/lib/auth";
import { emitConversationEvent } from "@/lib/server-events";

type TypingPayload = {
  conversationId?: string;
  isTyping?: boolean;
};

const TYPING_TTL_MS = 6_000;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TypingPayload;

  try {
    body = (await request.json()) as TypingPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.conversationId || typeof body.conversationId !== "string") {
    return NextResponse.json({ error: "conversationId is required" }, { status: 400 });
  }

  const isTyping = Boolean(body.isTyping);

  try {
    await ensureConversationParticipant(body.conversationId, session.user.id);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Forbidden";
    return NextResponse.json({ error: message }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + TYPING_TTL_MS).toISOString();

  emitConversationEvent({
    type: "typing",
    conversationId: body.conversationId,
    typing: {
      userId: session.user.id,
      isTyping,
      expiresAt,
    },
  });

  return NextResponse.json({ success: true });
}
