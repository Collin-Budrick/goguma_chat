import { NextResponse } from "next/server";
import { z } from "zod";

import { markConversationRead } from "@/db/conversations";
import { auth } from "@/lib/auth";
import { emitDockIndicatorEvent } from "@/lib/server-events";

const markConversationReadSchema = z
  .object({
    lastMessageId: z.string().min(1).optional(),
  })
  .strict()
  .optional();

export async function POST(
  request: Request,
  context: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await context.params;

  if (!conversationId) {
    return NextResponse.json(
      { error: "Conversation ID is required" },
      { status: 400 },
    );
  }

  let payload: unknown = {};

  try {
    payload = await request.json();
  } catch (error) {
    payload = {};
  }

  const parseResult = markConversationReadSchema.safeParse(payload);

  if (!parseResult.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const lastMessageId = parseResult.data?.lastMessageId ?? null;

  try {
    await markConversationRead(conversationId, session.user.id, { lastMessageId });
    emitDockIndicatorEvent(session.user.id, {
      type: "refresh",
      scope: "chat",
      reason: "read",
      conversationId,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update read state";

    if (message.includes("not a conversation participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
