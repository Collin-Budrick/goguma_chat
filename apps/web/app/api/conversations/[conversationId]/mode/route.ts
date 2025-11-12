import { NextResponse } from "next/server";

import {
  serializeConversation,
  updateConversationMessagingMode,
} from "@/db/conversations";
import { auth } from "@/lib/auth";
import { isMessagingMode } from "@/lib/messaging-mode-shared";
import { emitConversationEvent } from "@/lib/server-events";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { conversationId } = await params;

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode =
    body && typeof body === "object" && "mode" in body
      ? (body as { mode?: unknown }).mode
      : undefined;

  if (!isMessagingMode(mode)) {
    return NextResponse.json({ error: "Invalid messaging mode" }, { status: 400 });
  }

  try {
    const conversation = await updateConversationMessagingMode(
      conversationId,
      session.user.id,
      mode,
    );

    const serialized = serializeConversation(conversation);

    emitConversationEvent({
      type: "settings",
      conversationId,
      settings: { messagingMode: serialized.messagingMode },
      updatedAt: serialized.updatedAt,
      updatedBy: session.user.id,
    });

    return NextResponse.json({ conversation: serialized });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update messaging mode";

    if (message.includes("participant")) {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    if (message.includes("not found")) {
      return NextResponse.json({ error: message }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
